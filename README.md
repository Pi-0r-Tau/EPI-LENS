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
    subgraph Browser
        YT[YouTube Video]
        CE[Chrome Extension]
    end

    subgraph Analysis Engine
        FC[Frame Capture]
        subgraph Core Metrics
            BR[Brightness Analysis]
            FD[Flash Detection]
            FR[Flash Rate]
        end

        subgraph Detailed Metrics
            PSI[PSI Calculation]
            SPA[Spatial Analysis]
            CHR[Chromatic Analysis]
            TMP[Temporal Analysis]
            FFT[FFT Analysis]
            EDG[Edge Detection]
            COH[Temporal Coherence]
        end

        subgraph Data Processing
            VAR[Color Variance]
            ENT[Frame Entropy]
            TCP[Temporal Changes]
            DIF[Frame Difference]
            MOT[Motion Detection]
        end

        subgraph Memory Management
            BUF[Temporal Buffer]
            CHK[Data Chunking]
            TST[Timestamp Tracking]
        end
    end

    subgraph Risk Assessment
        PSC[PSI Score]
        FRQ[Flash Frequency]
        INT[Flash Intensity]
        COV[Spatial Coverage]
        DUR[Flash Duration]
        SPE[Spectral Analysis]
        EDR[Edge Rate]
    end

    subgraph Exports
        CSV[CSV Export]
        JSON[JSON Export]
        
    end

    YT --> FC
    FC --> BR
    FC --> PSI
    FC --> SPA
    FC --> CHR
    FC --> FFT
    FC --> EDG

    BR --> FD
    FD --> FR

    PSI --> PSC
    FR --> FRQ
    BR --> INT
    SPA --> COV
    FD --> DUR
    FFT --> SPE
    EDG --> EDR

    PSC --> CSV
    PSC --> JSON
    
```

### Graphs from test run on music performance video 

![image](https://github.com/user-attachments/assets/d28a2e03-6688-4b6c-90e9-3cf494bdebc1)


