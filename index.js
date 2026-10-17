const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient } = require('mongodb');
dotenv.config();

const app = express();
const port = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection String
const mongoConnectionURI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.cjigwjn.mongodb.net/`

const client = new MongoClient(mongoConnectionURI);

const connectToMongoDB = async () => {
    try {
        // await client.connect();
        console.log('You successfully connected to MongoDB');

        const database = client.db('IdeaVault');
        const ideasCollection = database.collection('ideas');

        app.get('/', async (req, res) => {
            const cursor = ideasCollection.find({}).sort({ votes: -1 }).limit(6);
            const result = await cursor.toArray();

            res.send(result);
        });

        app.get('/ideas', async (req, res) => {
            const cursor = ideasCollection.find({});
            const result = await cursor.toArray();

            res.send(result);
        });

        return client;

    } catch (error) {
        console.dir(error);
    }
};

connectToMongoDB();

const disconnectFromMongoDB = async () => {
    await client.close();
};


app.listen(port, () => {
    console.log(`IdeaVault server listening on port ${port}`)
})