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
    await pool.query(
        `INSERT INTO phrases (hebrew_text, variant_1, variant_2)
         VALUES ($1, $2, $3)`,
        [hebrewText, variant1, variant2]
    );
};

export const getNextUncategorized = async () => {
    const result = await pool.query(
        `SELECT * FROM phrases 
         WHERE status = 'uncategorized' 
         ORDER BY created_at ASC 
         LIMIT 1`
    );
    return result.rows[0] || null;
};

export const updatePhrase = async ({ id, variant1, variant2, tag, status }) => {
    await pool.query(
        `UPDATE phrases 
         SET variant_1 = $1, variant_2 = $2, tag = $3, status = $4, approved_at = $5
         WHERE id = $6`,
        [variant1, variant2, tag, status, status === 'approved' ? new Date() : null, id]
    );
};

export const getPhrases = async (status = null) => {
    const query = status
        ? `SELECT * FROM phrases WHERE status = $1 ORDER BY created_at DESC`
        : `SELECT * FROM phrases ORDER BY created_at DESC`;
    const params = status ? [status] : [];
    const result = await pool.query(query, params);
    return result.rows;
};