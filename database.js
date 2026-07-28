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

export const saveSentence = async ({ hebrewText, variant1, variant2 }) => {
    const result = await pool.query(
        `INSERT INTO phrases (hebrew_text, variant_1, variant_2)
         VALUES ($1, $2, $3) RETURNING *`,
        [hebrewText, variant1, variant2]
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

// Editor-driven save: sets the final variant wording. Tagging stays
// entirely table-driven and untouched here, same as before.
export const updatePhrase = async ({ id, variant1, variant2 }) => {
    const result = await pool.query(
        `UPDATE phrases 
         SET variant_1 = $1, variant_2 = $2
         WHERE id = $3 RETURNING *`,
        [variant1, variant2, id]
    );
    return result.rows[0];
};

// Table-driven edit: touches only subtag_id, never variant_1 / variant_2.
export const updatePhraseSubtag = async ({ id, subtagId }) => {
    const result = await pool.query(
        `UPDATE phrases SET subtag_id = $1 WHERE id = $2 RETURNING *`,
        [subtagId || null, id]
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

export const getPhrases = async () => {
    const result = await pool.query(
        `SELECT p.*, t.name as subtag_name, pt.name as tag_name, pt.color as tag_color
         FROM phrases p
         LEFT JOIN tags t ON p.subtag_id = t.id
         LEFT JOIN tags pt ON t.parent_id = pt.id
         ORDER BY p.created_at DESC`
    );
    return result.rows;
};

export const getTags = async () => {
    const result = await pool.query(
        `SELECT * FROM tags ORDER BY parent_id NULLS FIRST, name ASC`
    );
    return result.rows;
};

export const createTag = async ({ name, color, parentId }) => {
    const result = await pool.query(
        `INSERT INTO tags (name, color, parent_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, color || null, parentId || null]
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