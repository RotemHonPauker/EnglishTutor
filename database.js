import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
let db;

export const connectDB = async () => {
    await client.connect();
    db = client.db('englishTutor');
    console.log('Connected to MongoDB');
};

export const saveSentence = async ({ hebrew, rephrasedHebrew, englishTranslation, category }) => {
    const sentence = {
        hebrew,
        rephrasedHebrew,
        englishTranslation,
        category,
        createdAt: new Date()
    };
    await db.collection('sentences').insertOne(sentence);
}; 

export const getDistinctCategories = async () => {
    const categories = await db.collection('sentences').distinct('category');
    return categories;
};