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
        YT[YouTube Video Player]
        CE[Chrome Extension]
    end

    subgraph Extension Components
        PP[Popup Interface]
        BG[Background Script]
        CS[Content Script]
        AN[Analyser]
    end

    subgraph Frame Analysis
        FC[Frame Capture]
        subgraph Luminance["Luminance Analysis"]
            LUM["Relative Luminance (Y)<br/>Y = 0.2126R + 0.7152G + 0.0722B"]
            BR["Brightness Calculation<br/>Normalized [0,1]"]
        end

        subgraph Color["Color Analysis"]
            CV["RGB Variance Analysis"]
            CHS["Color History (30 frames)"]
            CSD["Spike Detection (μ ± 2σ)"]
            TC["Temporal Color Changes"]
        end

        subgraph Flash["Flash Detection"]
            FI["Flash Intensity<br/>Frame-to-frame difference"]
            FR["Flash Rate<br/>Flashes per second"]
            FD["Flash Duration<br/>Timestamp-based"]
        end

        subgraph Temporal["Temporal Analysis"]
            FF["Flicker Frequency (Hz)"]
            TM["Temporal Changes"]
            EN["Frame Entropy"]
        end
    end

    subgraph Risk["Risk Assessment"]
        RA["Risk Level Classification"]
        RH["High: >3 fps or >0.8 intensity"]
        RM["Medium: >2 fps or >0.5 intensity"]
        RL["Low: Default state"]
    end

    subgraph Export["Data Export"]
        CSV["CSV Export"]
        JSON["JSON Export"]
        REP["Analysis Report"]
    end

    YT -->|Video Frames| CS
    CS -->|Frame Data| AN
    AN -->|Process Frame| FC

    FC --> LUM
    LUM --> BR
    BR --> FI

    FC --> CV
    CV --> CHS
    CHS --> CSD
    CHS --> TC

    FI --> FR
    FI --> FD

    BR --> FF
    BR --> TM
    FC --> EN

    FR --> RA
    FI --> RA
    RA --> RH
    RA --> RM
    RA --> RL

    CS -->|Metrics| PP
    PP -->|Export Request| CS
    CS --> CSV
    CS --> JSON
    CS --> REP
```

![image](https://github.com/user-attachments/assets/d28a2e03-6688-4b6c-90e9-3cf494bdebc1)


