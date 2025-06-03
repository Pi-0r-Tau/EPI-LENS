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

## Architecture Overview
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
```mermaid
graph TB
    subgraph Input
        VID[Video Frame Input]
        FC[Frame Capture]
        VID --> FC
    end

    subgraph Core_Analysis [Core Analysis Pipeline]
        subgraph Brightness [Brightness Analysis]
            BR["Luminance Calculation
            Y = 0.2126R + 0.7152G + 0.0722B"]
            FD["Flash Detection
            ΔB = |Bt - Bt-1| > threshold"]
            FR["Flash Rate
            FR = flashCount/frameTime"]
            BR --> FD --> FR
        end

        subgraph Spectral [Spectral Analysis]
            FFT["FFT Processing
            X(k) = Σx(n)e^(-j2πkn/N)"]
            FREQ["Frequency Analysis
            f = sampleRate * k/N"]
            DOM["Dominant Frequency
            max(|X(k)|), k>0"]
            FFT --> FREQ --> DOM
        end

        subgraph Spatial [Spatial Analysis]
            EDG["Edge Detection
            |∇f| = √(Gx² + Gy²)"]
            MOT["Motion Detection
            M = motionPixels/totalPixels"]
            DIST["Spatial Distribution
            Center vs Periphery"]
            EDG --> MOT --> DIST
        end
    end

    subgraph Risk [Risk Assessment]
        PSI["PSI Calculation
        0.3F + 0.25I + 0.2C + 0.15D + 0.1B"]
        COH["Temporal Coherence
        R(τ) = E[(Xt-μ)(Xt+τ-μ)]/σ²"]
        VAR["Color Variance
        σ² = Σ(x-μ)²/N"]
    end

    subgraph Memory [Memory Management]
        BUF["Temporal Buffer
        CircularBuffer(128)"]
        CHK["Data Chunks
        1000 frames/chunk"]
        CLEAN["Garbage Collection"]
    end

    subgraph Export [Data Export]
        DATA[Analysis Data]
        OUT["Output Formats
        CSV | JSON | Metadata"]
        DATA --> OUT
    end

    FC --> BR
    FC --> FFT
    FC --> EDG

    FR --> PSI
    DOM --> PSI
    DIST --> PSI

    BUF --> FFT
    BUF --> COH

    PSI --> DATA
    VAR --> DATA

    Memory --> Export
```

### Graphs from test run on music performance video 

![image](https://github.com/user-attachments/assets/d28a2e03-6688-4b6c-90e9-3cf494bdebc1)


