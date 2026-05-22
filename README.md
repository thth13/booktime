# Booktime

Next.js reading timer app backed by MongoDB.

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` to your MongoDB Atlas connection string.
3. Install dependencies and run the app:

```bash
yarn install
yarn dev
```

## Vercel

Add these Environment Variables in the Vercel project settings:

```bash
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=booktime
```

The app uses the Node.js runtime for routes that talk to MongoDB. Use MongoDB Atlas or another managed MongoDB instance that Vercel can reach.

The timer starts optimistically in the browser. Start and stop actions are queued in `localStorage` while offline and replayed to the API when the connection returns. The backend stores the original reading start timestamp, so an active timer survives browser reloads after the start event reaches MongoDB.
