# archtecture

## system overview

```mermaid
graph TB
    subgraph "GUI (primary interface)"
        PC[persona cards]
        KG[knowledge graph<br/>D3]
        TB[tag browser<br/>AO3-style]
        ME[memory explorer]
        PM[permissions matrix]
        SF[sharing flow diagram]
        RL[retrieval log]
        DD[decay dashboard]
    end

    subgraph "core engine"
        IDX[indexing service]
        RET[retrieval pipeline<br/>7-step, 6 signals]
        DCY[decay service]
        TW[tag wrangler]
        SBX[sandbox enforcer]
    end

    subgraph "data stores"
        FB[falkordb<br/>graph: nodes, edges, tags]
        PG[supabase/postgres<br/>metadata, permissions, sharing]
        ST[storage<br/>multimodal files]
        VEC[vector store<br/>mem0 / pgvector]
    end

    subgraph "adapters (stack-agnostic)"
        SA[storage adapter]
        VA[vector adapter]
    end

    PC --> IDX
    KG --> RET
    TB --> TW
    ME --> IDX
    PM --> SBX
    SF --> SBX
    RL --> RET
    DD --> DCY

    IDX --> SA
    RET --> SA
    RET --> VA
    DCY --> SA
    TW --> SA
    SBX --> SA

    SA --> FB
    SA --> PG
    SA --> ST
    VA --> VEC
```

## retrieval pipeline architecture

```mermaid
flowchart LR
    Q[query + persona context] --> SS[1. semantic search<br/>15%]
    Q --> TM[2. tag match<br/>30%]
    Q --> HB[3. hierarchy boost<br/>10%]
    Q --> IW[4. identity weight<br/>10%]
    Q --> PR[5. persona relevance<br/>20%]
    Q --> SC[6. source confidence<br/>15%]

    SS --> COMB[7. weighted combination]
    TM --> COMB
    HB --> COMB
    IW --> COMB
    PR --> COMB
    SC --> COMB

    COMB --> GATE{confidence gate}
    GATE -->|"≥ 0.75"| CONF[confident<br/>return results]
    GATE -->|"≥ 0.45"| UNC[uncertain<br/>return with caveat]
    GATE -->|"≥ 0.25"| CLAR[needs clarification<br/>ask user]
    GATE -->|"< 0.25"| UNAVL[unavailable<br/>i don't know]

    CONF --> LOG[retrieval log]
    UNC --> LOG
    CLAR --> LOG
    UNAVL --> LOG
```

## memory indexing flow

```mermaid
flowchart TB
    SRC[source<br/>transcript / user / inference / shared] --> EXT[extract facts]
    EXT --> ASN[assign to perspective]
    ASN --> TAG[assign tags]
    TAG --> WRA[tag wrangling<br/>canonicalize]
    WRA --> WT[assign weight<br/>0-1, identity core]
    WRA --> HY[assign hierarchy<br/>0-1, behavior drive]
    WRA --> CF[assign confidence<br/>0-1]
    WT --> ASC[auto-associate<br/>shared tags, category, temporal]
    HY --> ASC
    CF --> ASC
    ASC --> STORE[store]
    STORE --> FB[(falkordb<br/>graph)]
    STORE --> PG[(postgres<br/>metadata)]
    STORE --> VEC[(vector store<br/>embedding)]
    STORE --> FS[(file storage<br/>multimodal)]
```

## persona POV switching

```mermaid
stateDiagram-v2
    [*] --> Global: system starts<br/>global self loaded
    Global --> PersonaA: user selects perspective A
    Global --> PersonaB: user selects perspective B
    Global --> PersonaC: user selects perspective C

    PersonaA --> PersonaB: rapid POV switch
    PersonaB --> PersonaA: rapid POV switch
    PersonaA --> PersonaC: rapid POV switch
    PersonaC --> Global: back to global

    note right of PersonaA
        sandboxed:
        - own memory
        - own permissions
        - own behavior config
        - own tag relevance
    end note

    note right of PersonaB
        no access to A or C
        unless sharing rules
        explicitly configured
    end note
```

## sandbox enforcement flow

```mermaid
flowchart TB
    REQ[retrieval request<br/>persona A, query Q] --> CHK1{memory in<br/>A's sandbox?}
    CHK1 -->|yes| ALLOW[allow]
    CHK1 -->|no| CHK2{memory in<br/>B's sandbox?}
    CHK2 -->|yes| CHK3{sharing rule<br/>B → A exists?}
    CHK2 -->|no| CHK4{memory in<br/>C's sandbox?}
    CHK3 -->|no| DENY1[deny<br/>no sharing rule]
    CHK3 -->|yes| CHK5{condition met?<br/>tags, category, min weight}
    CHK5 -->|no| DENY2[deny<br/>condition not met]
    CHK5 -->|yes| ALLOW
    CHK4 -->|yes| CHK6{sharing rule<br/>C → A exists?}
    CHK4 -->|no| DENY3[deny<br/>not found]
    CHK6 -->|no| DENY4[deny<br/>no sharing rule]
    CHK6 -->|yes| CHK7{condition met?}
    CHK7 -->|no| DENY5[deny<br/>condition not met]
    CHK7 -->|yes| ALLOW

    ALLOW --> LOG[log to sandbox_access_log<br/>result: allowed, rule_id]
    DENY1 --> LOG2[log to sandbox_access_log<br/>result: denied, reason]
    DENY2 --> LOG2
    DENY3 --> LOG2
    DENY4 --> LOG2
    DENY5 --> LOG2
```

## data model

```mermaid
erDiagram
    memory_nodes ||--o{ memory_associations : "source"
    memory_nodes ||--o{ memory_associations : "target"
    memory_nodes }o--o{ canonical_tags : "tagged with"
    canonical_tags ||--o{ tag_aliases : "has"
    canonical_tags ||--o{ tag_associations : "source"
    canonical_tags ||--o{ tag_associations : "target"
    canonical_tags ||--o{ tag_exclusions : "excludes"
    canonical_tags ||--o{ tag_persona_relevance : "relevance per persona"
    memory_nodes ||--|| multimodal_content : "may have"
    personas ||--|| persona_permissions : "has"
    personas ||--o{ persona_sharing : "shares from"
    personas ||--o{ persona_sharing : "shares to"
    memory_nodes ||--o{ memory_retrieval_confidence : "retrieved by"
    personas ||--o{ sandbox_access_log : "accesses"

    memory_nodes {
        text id PK
        text perspective_id FK
        text parent_id FK
        text key
        text value
        text category
        float weight "0-1 identity core, no decay"
        float hierarchy "0-1 behavior drive, decays"
        float confidence "0-1 accuracy"
        text tags "wrangled canonical tags"
        text content_type "text/image/pdf/code/audio/video"
        text content_url
        json content_metadata
        text source
        text source_meeting_id
        int recall_count
        timestamp last_recalled
        float decay_rate
    }

    canonical_tags {
        text id PK
        text canonical "unique"
        text description
        text parent_tag_id FK
        text category
        float weight "default for tagged memories"
        boolean is_active
    }

    personas {
        text id PK
        text name
        text display_name
        text email
        text context
        text tone
        text initiative_level
        text question_style
        text voice_id
        text language_preference
    }
```

## storage adapter architecture

```mermaid
graph TB
    subgraph "memorium core (stack-agnostic)"
        CORE[core engine<br/>indexing, retrieval, decay, wrangling]
        IFC[storage interface<br/>CRUD + query contract]
    end

    subgraph "adapters (you implement for your stack)"
        PA[postgres adapter]
        SA[sqlite adapter]
        FA[falkordb adapter]
        RA[redis adapter]
        SUP[supabase adapter]
    end

    subgraph "vector adapters"
        MA[mem0 adapter]
        PV[pgvector adapter]
        PI[pinecone adapter]
        WE[weaviate adapter]
    end

    CORE --> IFC
    IFC --> PA
    IFC --> SA
    IFC --> FA
    IFC --> RA
    IFC --> SUP
    CORE --> IFC
    IFC --> MA
    IFC --> PV
    IFC --> PI
    IFC --> WE
```

## GUI component architecture

```mermaid
graph TB
    subgraph "memorium GUI"
        SHELL[app shell<br/>persona selector + navigation]

        subgraph "persona view"
            CARDS[persona cards<br/>identity, memory count, weight/hierarchy]
            DETAIL[persona detail<br/>memory explorer, config, permissions]
        end

        subgraph "knowledge graph view"
            GRAPH[D3 force-directed graph<br/>nodes = memories, edges = associations]
            NODE[node detail panel<br/>tags, source, confidence, last recall]
            FILTERS[filter controls<br/>tag, weight range, hierarchy range, content type]
        end

        subgraph "tag management view"
            TAGTREE[canonical tag tree<br/>parent/child hierarchy]
            TAGEDIT[tag editor<br/>create, merge, alias, exclude, associate]
            TAGSEARCH[fuzzy tag search]
        end

        subgraph "permissions + sharing view"
            MATRIX[permissions matrix<br/>personas × sources]
            FLOW[sharing flow diagram<br/>arrows between personas]
            RULES[sharing rule editor<br/>direction, tags, category, min weight]
        end

        subgraph "transparency view"
            RLOG[retrieval log<br/>every query, every score]
            EXPAND[score breakdown<br/>6 signals expanded]
            SLOG[sandbox access log<br/>allowed + denied access attempts]
        end

        subgraph "decay view"
            DASH[decay dashboard<br/>hierarchy over time]
            REINFORCE[manual reinforcement<br/>reset decay, boost hierarchy]
            CONFIG[decay rate config<br/>per persona]
        end
    end

    SHELL --> CARDS
    SHELL --> GRAPH
    SHELL --> TAGTREE
    SHELL --> MATRIX
    SHELL --> RLOG
    SHELL --> DASH

    CARDS --> DETAIL
    GRAPH --> NODE
    GRAPH --> FILTERS
    TAGTREE --> TAGEDIT
    TAGTREE --> TAGSEARCH
    MATRIX --> FLOW
    FLOW --> RULES
    RLOG --> EXPAND
    RLOG --> SLOG
    DASH --> REINFORCE
    DASH --> CONFIG
```
