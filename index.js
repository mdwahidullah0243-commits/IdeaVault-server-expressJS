const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
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
        await client.connect();
        console.log('You successfully connected to MongoDB');

        const database = client.db('IdeaVault');
        const ideasCollection = database.collection('ideas');

        // GET request
        app.get('/', async (req, res) => {
            const cursor = ideasCollection.find({}).sort({ votes: -1 }).limit(6);
            const result = await cursor.toArray();

            res.send(result);
        });

        app.get('/ideas/idea-category/:name', async (req, res) => {
            const { name } = req.params;

            if (name === 'All') {
                const cursor = ideasCollection.find({});
                const result = await cursor.toArray();

                res.send(result);

            } else {
                const query = {
                    category: name
                };

                const cursor = ideasCollection.find(query);
                const result = await cursor.toArray();

                res.send(result);
            }
        });

        app.get('/ideas/sort/:sortingItem', async (req, res) => {
            const { sortingItem } = req.params;

            if (sortingItem === 'Newest') {
                const cursor = ideasCollection.find({});
                const allDoc = await cursor.toArray();

                const result = allDoc.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                res.send(result);

            } else if (sortingItem === 'Oldest') {
                const cursor = ideasCollection.find({});
                const allDoc = await cursor.toArray();

                const result = allDoc.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                res.send(result);

            } else {
                const cursor = ideasCollection.find({}).sort({ votes: -1 });
                const result = await cursor.toArray();

                res.send(result);
            }
        });

        app.get("/ideas/search", async (req, res) => {
            const { search = "" } = req.query;

            const escapeRegex = (value) =>
                value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            const query = {
                title: {
                    $regex: escapeRegex(search.trim()),
                    $options: "i"
                }
            };

            const result = await ideasCollection.find(query).toArray();

            res.send(result);
        });

        app.get('/idea-details/:ideaId', async (req, res) => {
            const { ideaId } = req.params;
            const query = {
                _id: new ObjectId(ideaId)
            };

            const result = await ideasCollection.findOne(query);

            res.send(result);
        });

        app.get('/my-ideas/:userId', async (req, res) => {
            const { userId } = req.params;
            const query = {
                userId
            };

            const cursor = ideasCollection.find(query);
            const result = await cursor.toArray();

            res.send(result);
        });


        // POST request
        app.post('/add-idea', async (req, res) => {
            const ideaData = await req.body;
            const result = await ideasCollection.insertOne(ideaData);

            res.send(result);
        });


        // UPDATE request
        app.patch('/my-ideas/:ideaId', async (req, res) => {
            const { ideaId } = req.params;
            const modifiedIdeaInfo = await req.body;

            const filter = {
                _id: new ObjectId(ideaId)
            };

            const updateDoc = {
                $set: {
                    ...modifiedIdeaInfo
                }
            };

            const result = await ideasCollection.updateOne(filter, updateDoc);

            res.send(result);
        });


        // DELETE request
        app.delete('/my-ideas/:ideaId', async (req, res) => {
            const { ideaId } = req.params;

            const filter = {
                _id: new ObjectId(ideaId)
            };

            const result = await ideasCollection.deleteOne(filter);

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