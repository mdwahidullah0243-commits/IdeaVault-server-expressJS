const express = require('express');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
dotenv.config();

const app = express();
const port = 8000;

const mongoConnectionURI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.cjigwjn.mongodb.net/`

const client = new MongoClient(mongoConnectionURI);

const connectToMongoDB = async () => {
    try {
        await client.connect();
        console.log('You successfully connected to MongoDB');
        
        return client;
        
    } catch (error) {
        console.dir(error);
    }
};

connectToMongoDB();

const disconnectFromMongoDB = async () => {
    await client.close();
};

app.get('/', (req, res) => {
    res.send('IdeaVault server is running!');
});


app.listen(port, () => {
    console.log(`IdeaVault server listening on port ${port}`)
})