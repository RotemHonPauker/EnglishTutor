import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URI 
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

// import dotenv from 'dotenv';
// dotenv.config();

// import { MongoClient } from 'mongodb';

// const client = new MongoClient(process.env.MONGODB_URI);
// let db;

// export const connectDB = async () => {
//     await client.connect();
//     db = client.db('englishTutor');
//     console.log('Connected to MongoDB');
// };

// export const saveSentence = async ({ rephrasedHebrew, translation, style, category }) => {
//     const sentence = {
//         rephrasedHebrew,
//         translation,
//         style,
//         category,
//         createdAt: new Date()
//     };
//     await db.collection('sentences').insertOne(sentence);
// }; 

// export const getDistinctStyles = async () => {
//     return await db.collection('sentences').distinct('style');
// };

// export const getDistinctCategories = async () => {
//     return await db.collection('sentences').distinct('category');
// };