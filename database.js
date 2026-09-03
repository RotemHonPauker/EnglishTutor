import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URI_SESSION, 
});

export const connectDB = async () => {
    await pool.query('SELECT 1');
    console.log('Connected to Postgres');
};

export const saveSentence = async ({ hebrewText, variant1, variant2, spaceId, tagId }) => {
    const result = await pool.query(
        `INSERT INTO phrases (hebrew_text, variant_1, variant_2, space_id, tag_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [hebrewText, variant1, variant2, spaceId, tagId || null]
    );
    return result.rows[0];
};

export const getPhraseById = async (id) => {
    const result = await pool.query(
        `SELECT * FROM phrases WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

// Editor-driven save: sets the final Hebrew text and variant wording.
// Tagging stays entirely table-driven and untouched here, same as before.
export const updatePhrase = async ({ id, hebrewText, variant1, variant2 }) => {
    const result = await pool.query(
        `UPDATE phrases 
         SET hebrew_text = $1, variant_1 = $2, variant_2 = $3
         WHERE id = $4 RETURNING *`,
        [hebrewText, variant1, variant2, id]
    );
    return result.rows[0];
};

// Table-driven edit: sets a phrase's tag directly
export const updatePhraseTag = async ({ id, tagId }) => {
    const result = await pool.query(
        `UPDATE phrases SET tag_id = $1 WHERE id = $2 RETURNING *`,
        [tagId || null, id]
    );
    return result.rows[0];
};

// Toggles "learned" — stores a timestamp (not just true/false) so it can
// later feed an analytics timeline of when things were learned. Passing
// learned=false clears it back to NULL.
export const updatePhraseLearned = async ({ id, learned }) => {
    const result = await pool.query(
        `UPDATE phrases SET learned_at = $1 WHERE id = $2 RETURNING *`,
        [learned ? new Date() : null, id]
    );
    return result.rows[0];
};

export const deletePhrase = async (id) => {
    const result = await pool.query(
        `DELETE FROM phrases WHERE id = $1 RETURNING *`,
        [id]
    );
    return result.rows[0] || null;
};

// Saves the cached-audio URL for one variant. deletePhrase above already
// returns the full row (including these URLs) on delete, so the route
// layer can clean up the matching files from disk without a separate fetch.
export const updatePhraseTtsUrl = async ({ id, variant, url }) => {
    const column = variant === 1 ? 'tts_url_variant1' : 'tts_url_variant2';
    const result = await pool.query(
        `UPDATE phrases SET ${column} = $1 WHERE id = $2 RETURNING *`,
        [url, id]
    );
    return result.rows[0];
};

export const getPhrases = async (spaceId) => {
    const result = await pool.query(
        `SELECT p.*, t.name as tag_name, t.color as tag_color
         FROM phrases p
         LEFT JOIN tags t ON p.tag_id = t.id
         WHERE p.space_id = $1
         ORDER BY p.created_at DESC`,
        [spaceId]
    );
    return result.rows;
};

// --- Spaces ---
// A space is a self contained world: its own tags, its own phrases, and its
// own translation-guidance prompt. Nothing is shared or filterable across
// spaces — the app always shows exactly one active space at a time.

export const getSpaces = async () => {
    const result = await pool.query(
        `SELECT * FROM spaces ORDER BY created_at ASC`
    );
    return result.rows;
};

export const createSpace = async ({ name }) => {
    const result = await pool.query(
        `INSERT INTO spaces (name) VALUES ($1) RETURNING *`,
        [name]
    );
    return result.rows[0];
};

export const updateSpace = async ({ id, name }) => {
    const result = await pool.query(
        `UPDATE spaces SET name = $1 WHERE id = $2 RETURNING *`,
        [name, id]
    );
    return result.rows[0];
};

// --- Space migration ---
// Moves everything from one space (source) into another (target), then
// deletes the source. Unlike a tag merge, a space's tags come along too
// (not deleted) — their space_id just moves, along with a rename/recolor
// if that collides with something already in the target. Phrases keep
// referencing the same tag_id throughout, since the tags themselves never
// change identity, only which space they belong to.

// Same palette as the frontend's tag color picker (tags.js) — kept in sync
// manually since colors rarely change.
const TAG_COLORS = [
    '#AD1457', '#D81B60', '#E67C73', '#F4511E',
    '#F09300', '#F6BF26', '#7CB342', '#0B8043',
    '#009688', '#33B679', '#039BE5', '#3F51B5',
    '#B39DDB', '#9E69AF', '#8E24AA', '#795548'
];

// A hard cap distinct from the app's existing ">3 saved transcripts"
// nudge (that one's just a soft cleanup reminder) — this one actually
// blocks a migration outright rather than silently piling transcripts up
// in the target space.
const MAX_TRANSCRIPTS_PER_SPACE_MIGRATION = 3;

export const migrateSpace = async ({ sourceId, targetId, dropSourceTranscripts = false }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot migrate a space into itself');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Transcript overflow check — skipped once the caller has already
        // confirmed dropping the source's transcripts instead of moving them.
        if (!dropSourceTranscripts) {
            const { rows } = await client.query(
                `SELECT
                    (SELECT COUNT(*)::int FROM transcripts WHERE space_id = $1) AS source_count,
                    (SELECT COUNT(*)::int FROM transcripts WHERE space_id = $2) AS target_count`,
                [sourceId, targetId]
            );
            const { source_count, target_count } = rows[0];
            if (source_count + target_count > MAX_TRANSCRIPTS_PER_SPACE_MIGRATION) {
                await client.query('ROLLBACK');
                const err = new Error('Too many transcripts to migrate');
                err.code = 'TOO_MANY_TRANSCRIPTS';
                err.sourceCount = source_count;
                err.targetCount = target_count;
                throw err;
            }
        }

        // Move (or drop) transcripts.
        if (dropSourceTranscripts) {
            await client.query(`DELETE FROM transcripts WHERE space_id = $1`, [sourceId]);
        } else {
            await client.query(`UPDATE transcripts SET space_id = $1 WHERE space_id = $2`, [targetId, sourceId]);
        }

        // Move tags, resolving name/color collisions against the target's
        // existing tags as we go.
        const { rows: sourceTags } = await client.query(`SELECT * FROM tags WHERE space_id = $1`, [sourceId]);
        const { rows: targetTags } = await client.query(`SELECT * FROM tags WHERE space_id = $2`, [targetId]);
        const usedNames = new Set(targetTags.map(t => t.name.toLowerCase()));
        const usedColors = new Set(targetTags.filter(t => t.color).map(t => t.color));

        for (const tag of sourceTags) {
            let newName = tag.name;
            if (usedNames.has(newName.toLowerCase())) {
                let suffix = '';
                let attempt = 1;
                do {
                    suffix = attempt === 1 ? ' (new)' : ` (new ${attempt})`;
                    attempt++;
                } while (usedNames.has((tag.name + suffix).toLowerCase()));
                newName = tag.name + suffix;
            }
            usedNames.add(newName.toLowerCase());

            let newColor = tag.color;
            if (newColor && usedColors.has(newColor)) {
                newColor = TAG_COLORS.find(c => !usedColors.has(c)) || null;
            }
            if (newColor) usedColors.add(newColor);

            await client.query(
                `UPDATE tags SET space_id = $1, name = $2, color = $3 WHERE id = $4`,
                [targetId, newName, newColor, tag.id]
            );
        }

        // Move phrases — tag_id references stay valid, since the tags
        // they point to just moved along rather than being replaced.
        await client.query(`UPDATE phrases SET space_id = $1 WHERE space_id = $2`, [targetId, sourceId]);

        // The source space is now empty — remove it.
        await client.query(`DELETE FROM spaces WHERE id = $1`, [sourceId]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// --- Space rules ---
// Each space's own translation rules, stored directly as a column on
// spaces. Edited manually in the database, not through the app.
// A space with no rules yet is a normal, valid state —
// translation still works fine using just the base template.

export const getSpaceRules = async (spaceId) => {
    const { rows } = await pool.query(
        `SELECT rules FROM spaces WHERE id = $1`,
        [spaceId]
    );
    return rows[0]?.rules ?? null;
};

// --- Tags ---

export const getTags = async (spaceId) => {
    const result = await pool.query(
        `SELECT * FROM tags WHERE space_id = $1 ORDER BY name ASC`,
        [spaceId]
    );
    return result.rows;
};

export const createTag = async ({ name, color, spaceId }) => {
    const result = await pool.query(
        `INSERT INTO tags (name, color, space_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, color || null, spaceId]
    );
    return result.rows[0];
};

export const updateTag = async ({ id, name, color }) => {
    // Only touch the columns actually passed in.
    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) {
        fields.push(`name = $${i++}`);
        values.push(name);
    }
    if (color !== undefined) {
        fields.push(`color = $${i++}`);
        values.push(color || null);
    }

    if (!fields.length) {
        const { rows } = await pool.query(`SELECT * FROM tags WHERE id = $1`, [id]);
        return rows[0];
    }

    values.push(id);
    const result = await pool.query(
        `UPDATE tags SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
    );
    return result.rows[0];
};

export const deleteTag = async (id) => {
    const { rows: phraseRows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM phrases WHERE tag_id = $1`,
        [id]
    );
    if (phraseRows[0].count > 0) {
        throw new Error(`This tag has ${phraseRows[0].count} phrase(s) linked to it. Merge or retag them first.`);
    }

    await pool.query(`DELETE FROM tags WHERE id = $1`, [id]);
};

// Moves every phrase from sourceId onto targetId, then deletes the source tag.
export const mergeTags = async ({ sourceId, targetId }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot merge a tag into itself');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT id FROM tags WHERE id IN ($1, $2)`,
            [sourceId, targetId]
        );
        if (rows.length !== 2) {
            throw new Error('Both tags must exist');
        }

        await client.query(
            `UPDATE phrases SET tag_id = $1 WHERE tag_id = $2`,
            [targetId, sourceId]
        );
        await client.query(`DELETE FROM tags WHERE id = $1`, [sourceId]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// --- Transcripts ---
// A backup of the cleaned transcript produced when processing a recording,
// scoped per space. Only the text is kept — never the original audio.

export const getTranscripts = async (spaceId) => {
    const result = await pool.query(
        `SELECT * FROM transcripts WHERE space_id = $1 ORDER BY created_at DESC`,
        [spaceId]
    );
    return result.rows;
};

export const createTranscript = async ({ spaceId, content }) => {
    const result = await pool.query(
        `INSERT INTO transcripts (space_id, content) VALUES ($1, $2) RETURNING *`,
        [spaceId, content]
    );
    return result.rows[0];
};

export const deleteTranscript = async (id) => {
    const result = await pool.query(
        `DELETE FROM transcripts WHERE id = $1 RETURNING *`,
        [id]
    );
    return result.rows[0] || null;
};