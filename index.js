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


// Database-এ comments flat structure-এ আছে, কিন্তু frontend-এ আমার nested structure প্রয়োজন।
// সেজন্য প্রথমে সব comments fetch করে JavaScript দিয়ে tree তৈরি করে নিচ্ছি।

const buildCommentTree = (comments) => {
    const commentMap = new Map();
    const roots = [];

    // Step 1: Create lookup map
    comments.forEach((comment) => {
        commentMap.set(comment._id.toString(), {
            ...comment,
            replies: []
        });
    });

    // Step 2: Build parent-child relationships
    comments.forEach((comment) => {
        const current = commentMap.get(comment._id.toString());

        if (comment.parentId) {
            const parent = commentMap.get(
                comment.parentId.toString()
            );

            if (parent) {
                parent.replies.push(current);
            }
        } else {
            roots.push(current);
        }
    });

    return roots;
};

// Database Connection String
const mongoConnectionURI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.cjigwjn.mongodb.net/`

const client = new MongoClient(mongoConnectionURI);

const connectToMongoDB = async () => {
    try {
        await client.connect();
        console.log('You successfully connected to MongoDB');

        const database = client.db('IdeaVault');
        const ideasCollection = database.collection('ideas');
        const votesOnIdeaCollection = database.collection('votes-on-idea');
        const commentsCollection = database.collection('comments');
        const votesOnCommentCollection = database.collection('votes-on-comment');
        const userCollection = database.collection('user');

        // API Routes

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

        app.get('/idea-details/:ideaId/votes/:userId', async (req, res) => {
            const { ideaId, userId } = req.params;

            const query = {
                ideaId: new ObjectId(ideaId),
                userId
            };

            const result = await votesOnIdeaCollection.findOne(query);

            if (result) {
                res.status(200).json({ message: true });
            } else {
                res.status(404).json({ message: false });
            };
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

        // GET API — Nested Comments Return করা
        app.get("/ideas/:ideaId/comments", async (req, res) => {
            try {
                const { ideaId } = req.params;

                if (!ObjectId.isValid(ideaId)) {
                    return res.status(400).json({
                        message: "Invalid idea ID"
                    });
                }

                const comments = await commentsCollection
                    .find({ ideaId: new ObjectId(ideaId) })
                    .sort({ createdAt: -1, _id: -1 })
                    .toArray();

                const nestedComments = buildCommentTree(comments);

                res.status(200).json(nestedComments);

            } catch (error) {
                res.status(500).json({
                    message: "Failed to fetch comments"
                });
            }
        });

        app.get('/my-interactions/comments/:userId', async (req, res) => {
            const { userId } = req.params;

            const cursor = commentsCollection.find({ userId });
            const result = await cursor.toArray();

            res.send(result);
        });

        app.get('/my-interactions/likes/:userId', async (req, res) => {
            const { userId } = req.params;

            const coll_1 = await votesOnCommentCollection.find({ userId }).toArray();
            const coll_2 = await votesOnIdeaCollection.find({ userId }).toArray();

            const result = [...coll_1, ...coll_2];

            res.send(result);
        });


        // POST request
        app.post('/add-idea', async (req, res) => {
            const ideaData = await req.body;
            const result = await ideasCollection.insertOne(ideaData);

            res.send(result);
        });

        // Create a comment
        app.post("/ideas/:ideaId/comments/:userId", async (req, res) => {
            try {
                const { ideaId, userId } = req.params;
                const { text, user, avatar, title } = await req.body;

                if (!ObjectId.isValid(ideaId)) {
                    return res.status(400).json({
                        message: "Invalid idea ID"
                    });
                }

                if (typeof text !== "string" || !text.trim()) {
                    return res.status(400).json({
                        message: "Comment text is required"
                    });
                }

                const comment = {
                    userId,
                    ideaId: new ObjectId(ideaId),
                    parentId: null,
                    user,
                    avatar,
                    text: text.trim(),
                    title,
                    likes: 0,
                    createdAt: new Date()
                };

                const result = await commentsCollection.insertOne(comment);

                await ideasCollection.updateOne(
                    {
                        userId,
                        _id: new ObjectId(ideaId)
                    },
                    {
                        $inc: {
                            comments: 1
                        }
                    }
                );

                res.status(201).json({
                    message: "Comment created successfully",
                    comment: {
                        ...comment,
                        _id: result.insertedId
                    }
                });

            } catch (error) {
                res.status(500).json({
                    message: "Failed to create comment"
                });
            }
        });

        // Create a Reply
        app.post("/ideas/:ideaId/comments/:parentId/replies/:userId", async (req, res) => {
            try {
                const { ideaId, parentId, userId } = req.params;
                const { text, user, avatar, title } = req.body;

                if (!ObjectId.isValid(ideaId) || !ObjectId.isValid(parentId)) {
                    return res.status(400).json({
                        message: "Invalid ID"
                    });
                }

                if (typeof text !== "string" || !text.trim()) {
                    return res.status(400).json({
                        message: "Reply text is required"
                    });
                };

                const ideaObjectId = new ObjectId(ideaId);
                const parentObjectId = new ObjectId(parentId);

                // Check parent comment exists under this idea
                const parentComment = await commentsCollection.findOne({
                    _id: parentObjectId,
                    ideaId: ideaObjectId
                });

                if (!parentComment) {
                    return res.status(404).json({
                        message: "Parent comment not found"
                    });
                }

                const reply = {
                    ideaId: ideaObjectId,
                    parentId: parentObjectId,
                    userId,
                    user,
                    avatar,
                    text: text.trim(),
                    title,
                    likes: 0,
                    createdAt: new Date()
                };

                const result = await commentsCollection.insertOne(reply);

                await ideasCollection.updateOne(
                    {
                        userId,
                        _id: new ObjectId(ideaId)
                    },
                    {
                        $inc: {
                            comments: 1
                        }
                    }
                );

                res.status(201).json({
                    message: "Reply created successfully",
                    reply: {
                        ...reply,
                        _id: result.insertedId
                    }
                });

            } catch (error) {
                res.status(500).json({
                    message: "Failed to create reply"
                });
            }
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

        // update idea and create vote
        app.patch("/idea-details/:detailsId", async (req, res) => {
            const { detailsId } = req.params;
            const votesInfo = await req.body;
            const { isLiked, userId, title, shortDesc } = votesInfo;

            if (!ObjectId.isValid(detailsId)) {
                return res.status(400).json({
                    message: "Invalid idea ID"
                });
            };

            if (!userId) {
                return res.status(401).json({
                    message: "Unauthorized"
                });
            };

            if (typeof isLiked !== "boolean") {
                return res.status(400).json({
                    message: "isLiked must be a boolean"
                });
            };

            const ideaId = new ObjectId(detailsId);
            const session = client.startSession();

            try {
                const result = await session.withTransaction(async () => {
                    const idea = await ideasCollection.findOne(
                        { _id: ideaId },
                        { session }
                    );

                    if (!idea) {
                        throw new Error("IDEA_NOT_FOUND");
                    };

                    const voteQuery = { ideaId, userId };

                    if (isLiked) {
                        // Insert only if this user hasn't voted
                        const insertResult = await votesOnIdeaCollection.updateOne(
                            voteQuery,
                            {
                                $setOnInsert: {
                                    ideaId,
                                    userId,
                                    title,
                                    shortDesc,
                                    createdAt: new Date()
                                }
                            },
                            { upsert: true, session }
                        );

                        if (insertResult.upsertedCount === 1) {
                            await ideasCollection.updateOne(
                                { _id: ideaId },
                                { $inc: { votes: 1 } },
                                { session }
                            );
                        }

                    } else {
                        // Delete existing vote
                        const deleteResult = await votesOnIdeaCollection.deleteOne(
                            voteQuery,
                            { session }
                        );

                        if (deleteResult.deletedCount === 1) {
                            await ideasCollection.updateOne(
                                { _id: ideaId },
                                { $inc: { votes: -1 } },
                                { session }
                            );
                        };
                    };

                    const updatedIdea = await ideasCollection.findOne(
                        { _id: ideaId },
                        { session }
                    );

                    return {
                        votes: updatedIdea.votes,
                        isLiked
                    };
                });

                res.status(200).json({
                    message: "Idea published successfully",
                    ...result
                });

            } catch (error) {
                console.error(error);

                if (error.message === "IDEA_NOT_FOUND") {
                    return res.status(404).json({
                        message: "Idea not found"
                    });
                }

                res.status(500).json({
                    message: "Failed to publish idea"
                });

            } finally {
                await session.endSession();
            }
        });

        // update comment in comments collection and create vote in vote-on-comment collection
        app.patch("/idea/:detailsId/comment/:commentId/liked", async (req, res) => {
            const { detailsId, commentId } = req.params;
            const votesInfo = await req.body;
            const { isLiked, userId, shortDesc, title } = votesInfo;

            if (!ObjectId.isValid(detailsId)) {
                return res.status(400).json({
                    message: "Invalid idea ID"
                });
            };

            if (!ObjectId.isValid(commentId)) {
                return res.status(400).json({
                    message: "Invalid comment ID"
                });
            };

            if (!userId) {
                return res.status(401).json({
                    message: "Unauthorized"
                });
            };

            if (typeof isLiked !== "boolean") {
                return res.status(400).json({
                    message: "isLiked must be a boolean"
                });
            };

            const ideaId = new ObjectId(detailsId);
            const session = client.startSession();

            try {
                const result = await session.withTransaction(async () => {
                    const idea = await ideasCollection.findOne(
                        { _id: ideaId },
                        { session }
                    );

                    if (!idea) {
                        throw new Error("IDEA_NOT_FOUND");
                    };

                    const comment = await commentsCollection.findOne(
                        { _id: new ObjectId(commentId) },
                        { session }
                    );

                    if (!comment) {
                        throw new Error("COMMENT_NOT_FOUND");
                    };

                    const voteQuery = { ideaId, userId, commentId: new ObjectId(commentId) };

                    if (isLiked) {
                        // Insert only if this user hasn't voted
                        const insertResult = await votesOnCommentCollection.updateOne(
                            voteQuery,
                            {
                                $setOnInsert: {
                                    ideaId,
                                    userId,
                                    commentId: new ObjectId(commentId),
                                    title,
                                    shortDesc,
                                    createdAt: new Date()
                                }
                            },
                            { upsert: true, session }
                        );

                        if (insertResult.upsertedCount === 1) {
                            await commentsCollection.updateOne(
                                {
                                    _id: new ObjectId(commentId),
                                    ideaId
                                },
                                { $inc: { likes: 1 } },
                                { session }
                            );
                        }

                    } else {
                        // Delete existing vote
                        const deleteResult = await votesOnCommentCollection.deleteOne(
                            voteQuery,
                            { session }
                        );

                        if (deleteResult.deletedCount === 1) {
                            await commentsCollection.updateOne(
                                {
                                    _id: new ObjectId(commentId),
                                    ideaId
                                },
                                { $inc: { likes: -1 } },
                                { session }
                            );
                        };
                    };

                    const updatedComment = await commentsCollection.findOne(
                        {
                            _id: new ObjectId(commentId),
                            ideaId
                        },
                        { session }
                    );

                    return {
                        likes: updatedComment.likes,
                        isLiked
                    };
                });

                res.status(200).json({
                    message: "Idea published successfully",
                    ...result
                });

            } catch (error) {
                console.error(error);

                if (error.message === "IDEA_NOT_FOUND") {
                    return res.status(404).json({
                        message: "Idea not found"
                    });
                }

                res.status(500).json({
                    message: "Failed to publish idea"
                });

            } finally {
                await session.endSession();
            }
        });

        app.patch('/idea/:detailsId/comment/:commentId', async (req, res) => {
            const { detailsId, commentId } = req.params;
            const { text, userId } = await req.body;

            const filter = {
                _id: new ObjectId(commentId),
                ideaId: new ObjectId(detailsId),
                userId
            };

            const updateDoc = {
                $set: {
                    text,
                    createdAt: new Date()
                }
            };

            const result = await commentsCollection.updateOne(filter, updateDoc);

            res.send(result);
        });

        app.patch('/profile/edit/:userId', async (req, res) => {
            const { userId } = req.params;
            const {name, image} = await req.body;
            console.log({name, image})

            const filter = {
                _id: new ObjectId(userId)
            };

            const updateDoc = {
                $set: {
                    name,
                    image
                }
            };

            const result = await userCollection.updateOne(filter, updateDoc);

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

        app.delete('/idea/:detailsId/comment/:commentId/user/:userId', async (req, res) => {
            const { detailsId, commentId, userId } = req.params;

            const filter = {
                _id: new ObjectId(commentId),
                ideaId: new ObjectId(detailsId),
                userId
            };

            const result = await commentsCollection.deleteOne(filter);

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