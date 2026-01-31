Storage
=======

``CEM-002``

🤖 Relational Data  
---------------

``CEM-002-000``

Specification
~~~~~~~~~~~~~

.. include:: ./CEM-002-000.rst

Motivation
~~~~~~~~~~

- Modern SQL databases have equivalent performance for JSON data types.
- Postgres offers robust JSON support across relational databases.

🤖 Similar Data (Vector Space)
------------------------

``CEM-002-001``

Specification
~~~~~~~~~~~~~

.. include:: ./CEM-002-001.rst

Motivation
~~~~~~~~~~

.. list-table:: Vector Database Comparison
   :widths: 15 15 15 15 15 15 15
   :header-rows: 1
   :stub-columns: 1

   * - Feature
     - Milvus Lite
     - Milvus (Full)
     - pgvector
     - ChromaDB
     - Qdrant
     - Weaviate
   * - **Scaling Potential**
     - Small (Local)
     - Massive (Cluster)
     - High (SQL)
     - Limited
     - High (Native)
     - Very High (Sharding)
   * - **Complexity**
     - Very Low
     - High
     - Medium
     - Very Low
     - Low to Medium
     - Medium (Docker/Cloud)
   * - **Key Features**
     - Python-first
     - GPU Indexing
     - ACID, SQL Logic
     - Ease of use
     - Rust-speed, Payloads
     - GraphQL, Multi-modal
   * - **Best For**
     - Rapid Prototypes
     - Global Enterprise
     - Existing DBs
     - Simple PoCs
     - High-speed filtering
     - Complex Data Objects
   * - **Updates (CRUD)**
     - Local Upserts
     - Stream-based
     - Standard SQL
     - Basic Collection
     - Efficient Payload
     - Object-level Hybrid

🤖 Object
----------

``CEM-002-002``

Specification
~~~~~~~~~~~~~

.. include:: ./CEM-002-002.rst

Motivation
~~~~~~~~~~

The storage layer for a RAG system is a contextual anchor. You need
to store the original source documents such that the source is readily available.

.. list-table:: AI Storage Layers
   :widths: 15 17 17 17 17
   :header-rows: 1
   :stub-columns: 1

   * - Feature
     - MinIO
     - AWS S3 (with S3 Vectors)
     - Cloudflare R2
     - Azure Blob
   * - **Primary Role**
     - High-speed, On-prem/Hybrid
     - Massive Scale + Native Search
     - Zero-Egress, Edge Storage
     - Enterprise/Microsoft Stack
   * - **RAG Integration**
     - S3-API (Works with all DBs)
     - Native Vector Indexing (2026)
     - Fast edge-retrieval
     - Integrated with Azure AI
   * - **Performance**
     - Ultra-low latency (NVMe-tuned)
     - High (Express One Zone)
     - Medium (Global Edge)
     - High (Premium Tier)
   * - **Cost Model**
     - Free (OSS) or Licensed
     - Pay-as-you-go + Request fees
     - Fixed price per GB, $0 Egress
     - Tiered (Hot/Cool/Cold)
   * - **Best For**
     - Private clouds & Speed
     - Full AWS-ecosystem RAG
     - Global apps avoiding egress
     - Corporate/Internal QA

🤖 Related Data (Graph)
-----------------------

``CEM-002-003``

Specification
~~~~~~~~~~~~~

.. include:: ./CEM-002-003.rst

Motivation
~~~~~~~~~~

Compared to relational (Postgres):

Relational excels at tabular records (Q&A items, sessions, attempts), transactions, and simple joins; we use it for the core data model per CEM-002-000 and it’s sufficient for CRUD and reporting.
Graph excels at deep, variable-length relationship queries (e.g., “all concepts reachable within 2–3 hops that unlock ‘Eigenvectors’”), avoiding complex recursive SQL and performing better for path-finding.

Compared to vector DB (Qdrant/Weaviate):

Vector DB finds semantically similar content (“questions like this”).
Graph DB captures structured pedagogical relationships and constraints (“what you must learn before this”).
They complement each other: retrieve semantically relevant items, then filter/sequence via graph constraints.