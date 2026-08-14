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

export const saveSentence = async ({ hebrewText, variant1, variant2, spaceId }) => {
    const result = await pool.query(
        `INSERT INTO phrases (hebrew_text, variant_1, variant_2, space_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [hebrewText, variant1, variant2, spaceId]
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

// Table-driven edit: touches only subtag_id (and sequence_order, but only
// as an automatic side effect — see below), never variant_1 / variant_2.
export const updatePhraseSubtag = async ({ id, subtagId }) => {
    if (subtagId) {
        // Order only matters in spaces that opted into it at creation —
        // check via this phrase's own space, not the subtag directly.
        const { rows: phraseRows } = await pool.query(
            `SELECT space_id FROM phrases WHERE id = $1`,
            [id]
        );
        const spaceId = phraseRows[0]?.space_id;

        const { rows: spaceRows } = await pool.query(
            `SELECT has_order FROM spaces WHERE id = $1`,
            [spaceId]
        );
        const hasOrder = spaceRows[0]?.has_order;

        if (hasOrder) {
            // New tagging inherits "last in this subtag" by default — the
            // user can edit it to any specific number afterward (duplicates
            // across phrases are allowed, not an error).
            const { rows: maxRows } = await pool.query(
                `SELECT COALESCE(MAX(sequence_order), 0) + 1 AS next_order FROM phrases WHERE subtag_id = $1`,
                [subtagId]
            );
            const result = await pool.query(
                `UPDATE phrases SET subtag_id = $1, sequence_order = $2 WHERE id = $3 RETURNING *`,
                [subtagId, maxRows[0].next_order, id]
            );
            return result.rows[0];
        }
    }

    // Untagging, or a space that doesn't use ordering: no meaningful order
    // to keep.
    const result = await pool.query(
        `UPDATE phrases SET subtag_id = $1, sequence_order = NULL WHERE id = $2 RETURNING *`,
        [subtagId || null, id]
    );
    return result.rows[0];
};

// Manual override of a phrase's order number (see updatePhraseSubtag for
// how it's first assigned). Duplicates across phrases in the same subtag
// are allowed — this is a deliberate, user-set value, not a unique index.
export const updatePhraseSequenceOrder = async ({ id, sequenceOrder }) => {
    const result = await pool.query(
        `UPDATE phrases SET sequence_order = $1 WHERE id = $2 RETURNING *`,
        [sequenceOrder, id]
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
        `SELECT p.*, t.name as subtag_name, pt.name as tag_name, pt.color as tag_color
         FROM phrases p
         LEFT JOIN tags t ON p.subtag_id = t.id
         LEFT JOIN tags pt ON t.parent_id = pt.id
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

export const createSpace = async ({ name, hasOrder }) => {
    const result = await pool.query(
        `INSERT INTO spaces (name, has_order) VALUES ($1, $2) RETURNING *`,
        [name, hasOrder]
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

// --- Space rules ---
// Each space's own ADDITIONAL translation rules — not a full prompt by
// itself. At translation time these are combined with the fixed base
// template (dashboard/translation/translationPrompt.txt) into one prompt.
// A space with no rules yet is a normal, valid state — translation still
// works fine using just the base template. Stored in the space_prompts
// table; each save inserts a new row and only the 3 most recent rows per
// space are kept (current + 2 previous), older ones pruned automatically.

export const getSpaceRules = async (spaceId) => {
    const { rows } = await pool.query(
        `SELECT content FROM space_prompts WHERE space_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [spaceId]
    );
    return rows[0]?.content ?? null;
};

export const saveSpaceRules = async (spaceId, content) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO space_prompts (space_id, content) VALUES ($1, $2)`,
            [spaceId, content]
        );

        // Keep only the 3 most recent rows for this space (current + 2 prior).
        await client.query(
            `DELETE FROM space_prompts
             WHERE space_id = $1
             AND id NOT IN (
                 SELECT id FROM space_prompts
                 WHERE space_id = $1
                 ORDER BY created_at DESC
                 LIMIT 3
             )`,
            [spaceId]
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

export const getTags = async (spaceId) => {
    const result = await pool.query(
        `SELECT * FROM tags
         WHERE space_id = $1
         OR parent_id IN (SELECT id FROM tags WHERE space_id = $1)
         ORDER BY parent_id NULLS FIRST, name ASC`,
        [spaceId]
    );
    return result.rows;
};

export const createTag = async ({ name, color, parentId, spaceId }) => {
    // Main tags (no parent) belong directly to a space. Subtags don't store
    // their own space_id — they inherit it via parent_id.
    const result = await pool.query(
        `INSERT INTO tags (name, color, parent_id, space_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, color || null, parentId || null, parentId ? null : spaceId]
    );
    return result.rows[0];
};

export const updateTag = async ({ id, name, color, parentId }) => {
    // Migrating a subtag: make sure the target actually exists and is itself
    // a main tag — prevents accidentally nesting a subtag under another
    // subtag, which the rest of the app (and the UI) assumes never happens.
    if (parentId !== undefined && parentId !== null) {
        const { rows } = await pool.query(
            `SELECT parent_id FROM tags WHERE id = $1`,
            [parentId]
        );
        if (!rows.length) {
            throw new Error('Target main tag not found');
        }
        if (rows[0].parent_id) {
            throw new Error('Can only migrate a subtag under a main tag, not another subtag');
        }
    }

    // Only touch the columns actually passed in, so an ordinary name/color
    // edit never overwrites parent_id (and vice versa for a migrate call).
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
    if (parentId !== undefined) {
        fields.push(`parent_id = $${i++}`);
        values.push(parentId || null);
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
    const { rows: childRows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM tags WHERE parent_id = $1`,
        [id]
    );
    if (childRows[0].count > 0) {
        throw new Error(`This tag still has ${childRows[0].count} subtag(s). Delete or merge them first.`);
    }

    const { rows: phraseRows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM phrases WHERE subtag_id = $1`,
        [id]
    );
    if (phraseRows[0].count > 0) {
        throw new Error(`This subtag has ${phraseRows[0].count} phrase(s) linked to it. Migrate or merge them into another subtag first.`);
    }

    await pool.query(`DELETE FROM tags WHERE id = $1`, [id]);
};

export const mergeSubtags = async ({ sourceId, targetId }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot merge a subtag into itself');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT id, parent_id FROM tags WHERE id IN ($1, $2)`,
            [sourceId, targetId]
        );
        const source = rows.find(t => t.id === sourceId);
        const target = rows.find(t => t.id === targetId);

        if (!source || !target || !source.parent_id || !target.parent_id) {
            throw new Error('Both tags must be subtags');
        }
        if (source.parent_id !== target.parent_id) {
            throw new Error('Subtags must share the same parent tag');
        }

        await client.query(
            `UPDATE phrases SET subtag_id = $1 WHERE subtag_id = $2`,
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