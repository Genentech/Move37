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

🤖 Vectors
-------

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