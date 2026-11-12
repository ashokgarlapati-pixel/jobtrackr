# JobTrackr + MongoDB

A RESTful backend API for JobTrackr built with **Node.js**, **Express**, and **MongoDB Atlas** using **Mongoose**. This project migrates in-memory application tracking to a scalable database with relational modeling, indexing, aggregation, and pagination.

---

## Features

- **MongoDB Atlas Integration**: Server starts only after successfully establishing a database connection.
- **Data Modeling & Relationships**:
  - **Referencing**: Applications reference the `User` model (`owner` field as `ObjectId` with `ref: 'User'`).
  - **Embedding**: Applications embed an array of `notes` subdocuments (`text`, `createdAt`).
  - **Validation**: Enforces enums (`Applied`, `Interview`, `Offer`, `Rejected`), positive salaries (`min: 0`), unique emails, and required fields.
- **Robust Error Handling**:
  - `CastError` (invalid MongoDB ObjectId format) returns **400 Bad Request**.
  - `ValidationError` returns **400 Bad Request** with clear field-by-field error messages.
  - Non-existent IDs return **404 Not Found**.
- **Database Seeder**: `npm run seed` creates 2 users and 1,000 realistic random job applications.
- **Compound Indexing & Performance**: Compound index `{ owner: 1, status: 1 }` improves queries from a full collection scan (`COLLSCAN`) to an efficient index scan (`IXSCAN`).
- **Aggregation Pipeline**: `GET /api/applications/stats` uses `$match`, `$group`, and `$sort` to return counts per status and average salary for offers.
- **Pagination**: `GET /api/applications?page=1&limit=10` implements `skip` and `limit` and returns `total`, `totalPages`, `page`, and `limit`.

---

## Project Structure

```
jobtractr+mongodb/
├── config/
│   └── db.js                  # Database connection logic
├── models/
│   ├── Application.js         # Application schema with embedded notes & compound index
│   └── User.js                # User schema for application owner reference
├── routes/
│   ├── applicationRoutes.js   # CRUD, notes, stats aggregation, and pagination routes
│   └── userRoutes.js          # User creation and lookup routes
├── .env.example               # Template for environment variables
├── .gitignore                 # Excludes node_modules and .env
├── explain.js                 # Benchmark script comparing COLLSCAN vs IXSCAN
├── INTERVIEW.md               # Concise interview questions and answers
├── package.json               # Dependencies and npm scripts
├── README.md                  # Complete documentation
├── seed.js                    # Database seeder (2 users, 1,000 applications)
└── server.js                  # Main server entry point
```

---

## Setup & Installation

### 1. Prerequisites
- Node.js (v18 or higher)
- A MongoDB Atlas database cluster (or local MongoDB server)

### 2. Clone and Install Dependencies
```bash
git clone <your-repo-link>
cd jobtractr+mongodb
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (based on `.env.example`):
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/jobtrackr?retryWrites=true&w=majority
```

### 4. Seed the Database
Populate the database with 2 users and 1,000 applications:
```bash
npm run seed
```

### 5. Run Index Benchmark (explain)
Test query performance before and after adding the compound index:
```bash
npm run explain
```

### 6. Start the Server
```bash
# Normal start
npm start

# Development mode with hot-reloading
npm run dev
```
The server will connect to MongoDB Atlas and listen on `http://localhost:5000`.

---

## Design Decisions

### Why Notes are Embedded but Owner is Referenced

1. **Embedding Notes**:
   - **Data Ownership**: Notes belong strictly to one specific application. They have no meaning or lifecycle outside of that application.
   - **Access Pattern**: Whenever a user views an application, its notes are almost always retrieved together. Embedding avoids an extra lookup or join.
   - **Bounded Growth**: A job application typically has between 1 to 20 notes, well within MongoDB's 16MB document size limit.

2. **Referencing Owner**:
   - **Independent Lifecycle**: Users exist independently of applications. A user has their own profile, credentials, and settings.
   - **One-to-Many Growth**: A single user may submit hundreds or thousands of job applications over time. If applications were embedded in the user document, the user document could exceed MongoDB's 16MB limit.
   - **Clean Separation**: Referencing via `ObjectId` allows multiple applications to point to one user and allows users to be populated on demand using `.populate('owner', 'name email')`.

---

### When to Choose SQL vs MongoDB

- **Choose SQL (PostgreSQL, MySQL)** when:
  - Data is highly relational with complex many-to-many relationships across numerous entities.
  - Strict ACID guarantees and financial transaction consistency are required (e.g., banking, payment ledgers, order checkouts).
  - Schema must be strictly enforced at the database level and remains relatively stable.

- **Choose MongoDB (NoSQL)** when:
  - Requirements and data structures evolve rapidly, benefiting from a flexible schema.
  - Data fits a hierarchical, document-based model (e.g., job applications with embedded notes and status history).
  - High write throughput, horizontal scaling (sharding), and distributed storage are primary requirements.

---

## Indexing & Performance: `explain('executionStats')`

We queried applications filtering by `{ owner: <userId>, status: 'Interview' }` across 1,000 seeded documents.

### Benchmark Results

| Metric | Before Index (COLLSCAN) | After Index `{ owner: 1, status: 1 }` (IXSCAN) |
|---|---|---|
| **Query Stage** | `COLLSCAN` | `FETCH` -> `IXSCAN` |
| **Documents Examined** | **1,000** | **~125** (only matching documents) |
| **Keys Examined** | 0 | **~125** |
| **Documents Returned** | ~125 | ~125 |
| **Execution Time** | ~4 - 10 ms | **0 - 1 ms** |

### Analysis
- **Before the index**: MongoDB executed a **COLLSCAN** (collection scan), inspecting all 1,000 documents across the entire collection to find matching records.
- **After the compound index**: MongoDB executed an **IXSCAN** (index scan), navigating the B-tree index on `(owner, status)` directly to the matching keys, reading only the necessary documents. This drastically reduces CPU, memory, and disk I/O.

---

## Pagination & Why `skip` Gets Slow

### Why `skip` Gets Slow on Large Collections
When using `.skip(offset).limit(limit)`, MongoDB still has to traverse through all `offset` documents before returning the requested page. For example, `.skip(50000).limit(10)` requires the database engine to scan 50,010 documents and discard the first 50,000. As the offset increases, performance degrades to $O(N)$ time complexity.

### What to Use Instead: Cursor-Based Pagination (Keyset Pagination)
Instead of skipping records, use cursor-based pagination with a unique, ordered field (like `_id` or `createdAt`):
```javascript
// Fetch next page starting after the last seen item's ID
const nextApplications = await Application.find({
  _id: { $lt: lastSeenId },
  owner: userId
})
.sort({ _id: -1 })
.limit(limit);
```
With an index on `_id`, this query jumps directly to the target record in $O(1)$ time regardless of whether you are viewing the 1st page or the 10,000th page.

---

## API Documentation

### Base URL: `http://localhost:5000/api`

### 1. Applications

#### `GET /api/applications`
Retrieve a paginated list of applications with populated owner details.

- **Query Parameters**:
  - `page` (optional, default: 1): Page number
  - `limit` (optional, default: 10): Items per page
  - `status` (optional): Filter by status (`Applied`, `Interview`, `Offer`, `Rejected`)
  - `owner` (optional): Filter by user ObjectId
- **Response `200 OK`**:
  ```json
  {
    "page": 1,
    "limit": 10,
    "total": 1000,
    "totalPages": 100,
    "applications": [
      {
        "_id": "6732dc...",
        "company": "Google",
        "role": "Software Engineer",
        "owner": {
          "_id": "6732dc...",
          "name": "Alice Johnson",
          "email": "alice@example.com"
        },
        "status": "Interview",
        "salary": 120000,
        "notes": [
          {
            "_id": "6732dc...",
            "text": "Completed technical round",
            "createdAt": "2026-11-10T10:00:00.000Z"
          }
        ],
        "createdAt": "2026-11-08T09:00:00.000Z",
        "updatedAt": "2026-11-10T10:00:00.000Z"
      }
    ]
  }
  ```

---

#### `GET /api/applications/stats`
Get aggregated statistics on job applications using MongoDB aggregation pipeline (`$match`, `$group`, `$sort`).

- **Response `200 OK`**:
  ```json
  {
    "statusCounts": [
      { "_id": "Applied", "count": 270 },
      { "_id": "Interview", "count": 255 },
      { "_id": "Rejected", "count": 245 },
      { "_id": "Offer", "count": 230 }
    ],
    "averageOfferSalary": 109845
  }
  ```

---

#### `GET /api/applications/:id`
Get a single application by its ID with populated owner (`name email`).

- **Response `200 OK`**:
  ```json
  {
    "_id": "6732dc...",
    "company": "Amazon",
    "role": "Backend Developer",
    "owner": {
      "_id": "6732dc...",
      "name": "Bob Smith",
      "email": "bob@example.com"
    },
    "status": "Offer",
    "salary": 135000,
    "notes": [],
    "createdAt": "2026-11-09T08:00:00.000Z",
    "updatedAt": "2026-11-09T08:00:00.000Z"
  }
  ```
- **Response `400 Bad Request`** (CastError):
  ```json
  {
    "error": "Invalid _id: 123invalidid"
  }
  ```
- **Response `404 Not Found`**:
  ```json
  {
    "error": "Application not found"
  }
  ```

---

#### `POST /api/applications`
Create a new job application.

- **Request Body**:
  ```json
  {
    "company": "Stripe",
    "role": "Frontend Developer",
    "owner": "6732dc...",
    "status": "Applied",
    "salary": 95000
  }
  ```
- **Response `201 Created`**: Returns created application object with populated owner.
- **Response `400 Bad Request`** (ValidationError):
  ```json
  {
    "error": "Validation failed",
    "messages": {
      "company": "Company is required",
      "role": "Role is required",
      "owner": "Owner is required"
    }
  }
  ```

---

#### `PUT /api/applications/:id`
Update an existing application (runs schema validators).

- **Request Body**:
  ```json
  {
    "status": "Interview",
    "salary": 110000
  }
  ```
- **Response `200 OK`**: Returns updated application.

---

#### `DELETE /api/applications/:id`
Delete an application by its ID.

- **Response `200 OK`**:
  ```json
  {
    "message": "Application deleted successfully"
  }
  ```

---

#### `POST /api/applications/:id/notes`
Push a new note subdocument into the application's notes array.

- **Request Body**:
  ```json
  {
    "text": "HR called to confirm final offer details."
  }
  ```
- **Response `200 OK`**: Returns the updated application with populated owner (`name email`).
- **Response `400 Bad Request`**:
  ```json
  {
    "error": "Validation failed",
    "messages": {
      "text": "Note text is required"
    }
  }
  ```

---

### 2. Users Helper Endpoints

#### `POST /api/users`
Create a new user.
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

#### `GET /api/users`
List all users.

---

## Testing with Postman

1. **Create User**: `POST http://localhost:5000/api/users`
2. **Create Application**: `POST http://localhost:5000/api/applications` with the user's `_id` as `owner`.
3. **Add Note**: `POST http://localhost:5000/api/applications/<id>/notes` with `{ "text": "Interview scheduled" }`.
4. **Get Stats**: `GET http://localhost:5000/api/applications/stats`.
5. **Get Paginated**: `GET http://localhost:5000/api/applications?page=2&limit=10`.
6. **Test Bad ID (CastError)**: `GET http://localhost:5000/api/applications/bad-id-123` (returns 400).
7. **Test Validation Error**: `POST http://localhost:5000/api/applications` with `{ "salary": -500 }` (returns 400 with field messages).

#   j o b t r a c k r  
 