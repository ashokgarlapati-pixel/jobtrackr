# Interview Corner - JobTrackr + MongoDB

### 1. Embedding vs referencing: how do you decide? Give an example of each.

I decide based on data ownership, document growth, and how data is queried. 

I embed when child data belongs exclusively to one parent, is always read together, and has a bounded size—such as notes inside a job application. 

I reference when data exists independently, is shared across records, or can grow unboundedly—such as referencing a User as the owner of an application.

---

### 2. Why do queries get slow, and how do indexes help? What is the cost of adding an index?

Queries get slow because MongoDB does a full collection scan (`COLLSCAN`), inspecting every document in the collection one by one. 

Indexes create an ordered B-tree structure that lets MongoDB jump directly to matching entries (`IXSCAN`), scanning only relevant keys. 

The tradeoff is extra disk and memory consumption, plus slower write operations because every insert, update, or delete must also update the index.

---

### 3. SQL vs NoSQL: when would you choose each for a new project?

I would choose SQL when the project has strict relational schemas, complex multi-table joins, and requires ACID transactions—such as banking systems or inventory tracking.

I would choose NoSQL (like MongoDB) when schema requirements evolve rapidly, data is naturally hierarchical or document-centric, and horizontal scalability is a priority—such as content management platforms, real-time analytics, or rapid product prototypes like JobTrackr.
