# EPI-LENS
**E**pilepsy **P**hotic **I**ntensity **L**evel **E**valuator for **N**euro Visual **S**timuli

EPI-LENS is a browser extension designed to analyse video content for potentially harmful photosensitive triggers in real-time. It provides detailed metrics and analytics for researchers and accessibility specialists and exports as CSV and JSON.

## Use Cases

### Machine Learning Data Collection
- Generation of training datasets for ML models focused on:
  - Flash detection algorithms
  - Content safety classification
  - Automated video content moderation
- Structured data export in CSV/JSON formats for direct ML pipeline integration
- Frame-by-frame analysis with detailed metrics for model training
- Temporal analysis data for sequence-based learning models

### Accessibility Research
- Quantitative analysis of video content for accessibility studies
- Documentation of potentially harmful content patterns
- Development of improved safety guidelines
- Validation of content modification techniques
- Support for academic research in photosensitive epilepsy triggers
- Identification of problematic sequences
- Guidance for content modifications
- Quality assurance for accessibility compliance

## Architecture 
```mermaid
graph TB
    subgraph Video Processing
        VID[Video Frame] --> CAP[Frame Capture]
        CAP --> |ImageData| ANA[Analysis Engine]
    end

    subgraph Memory System
        BUF[Circular Buffer]
        CHK[Data Chunks]
        TST[Timestamp Manager]
    end

    subgraph Analysis Pipeline
        ANA --> |Brightness| BRI[Brightness Analysis]
        ANA --> |Color| COL[Color Processing]
        ANA --> |Motion| MOT[Motion Detection]
        ANA --> |Edges| EDG[Edge Analysis]

        subgraph Real-time Metrics
            BRI --> FLA[Flash Detection]
            COL --> VAR[Variance Analysis]
            MOT --> DIF[Frame Difference]
            EDG --> CHG[Edge Change Rate]
        end

        subgraph Signal Processing
            FLA --> FFT[FFT Analysis]
            VAR --> COH[Coherence Analysis]
            DIF --> PER[Periodicity Detection]
            CHG --> TMP[Temporal Analysis]
        end
    end

    subgraph Data Management
        FFT & COH & PER & TMP --> AGG[Data Aggregation]
        AGG --> BUF
        BUF --> CHK
        CHK --> EXP[Export System]
    end

    subgraph Export Formats
        EXP --> CSV[CSV Export]
        EXP --> JSN[JSON Export]
    end
    
```

### Graphs from test run on music performance video 

![image](https://github.com/user-attachments/assets/d28a2e03-6688-4b6c-90e9-3cf494bdebc1)


