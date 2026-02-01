Large Language Models
=====================

🤖 Embeddings
--------------

``CEM-014-000``

Specification
~~~~~~~~~~~~~

.. include:: ./CEM-014-000.rst

Motivation
~~~~~~~~~~

.. list-table:: Embedding Models
   :widths: 15 17 17 17 17 17
   :header-rows: 1
   :stub-columns: 1

   * - Model
     - Provider
     - Strengths
     - Dimensions
     - Latency
     - Best For
   * - **Voyage-3.5**
     - Voyage AI
     - SOTA for RAG; context-aware
     - 1024 (Flex)
     - Low (API)
     - High-precision QA
   * - **Embed-v4.0**
     - Cohere
     - Multilingual & Multi-modal
     - 1024
     - Low (API)
     - Global, diverse data
   * - **text-embed-3**
     - OpenAI
     - Massive adoption, stable API
     - 1536/3072
     - Medium (API)
     - General purpose
   * - **BGE-M3**
     - BAAI (OSS)
     - Multi-lingual & Sparse/Dense
     - 1024
     - Var (Host)
     - Private/On-prem
   * - **Qwen3-Embed**
     - Alibaba (OSS)
     - Instruction-aware, efficient
     - 512–1024
     - Ultra Low
     - Small-data agility
