# Getting Started

This project models a hypothetical 5 MW data center facility as an independent engineering portfolio. Its scope covers the building, electrical infrastructure, cooling, energy, facility economics, reliability, commissioning, and operations. It contains no internal AWS design information.

Open the PDF under `deliverables/` for the portfolio narrative. The workbook in the same directory contains assumptions, engineering sizing, energy, cash flow, sensitivity analysis, checks, and sources. Blue text identifies editable assumptions; green text identifies references to other worksheets.

Run the commands listed in the main README from the repository root. Modify `configs/tropical-5mw.json`, then create a new result set with the `--output` option. Do not combine results produced from different configurations. Weather, tariffs, costs, emissions, and site data are illustrative inputs rather than results from an Indonesian site survey.

For GitHub, upload the complete contents of the project directory, including dot-prefixed directories such as `.github`. Exclude caches, `.venv`, and `node_modules`. The intended repository is `robotjaol/datacenter`; it was empty when inspected. This package is prepared for the owner to upload.

Release 0.1 is a reproducible concept study. Validated CFD, protection coordination, structural design, permit documents, coordinated BIM, and physical commissioning require the later development stages listed in [Maturity and Release Gates](maturity.md).

## Run the interactive digital twin

Requires Python 3.11 or newer and Node 22 or newer.

```bash
python -m dcf.cli web-data          # export the data contract to build/web-data
cd web && npm ci && npm run build   # build the interface
cd .. && python -m dcf.cli serve    # open http://127.0.0.1:8765
```

For development run `python -m dcf.cli serve` in one terminal and `npm run dev` in `web/` in another. The Scenario Explorer needs the Python server because it runs the real model. See [architecture/data-flow.md](architecture/data-flow.md).
