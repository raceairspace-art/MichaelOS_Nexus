from __future__ import annotations

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
# Vercel Functions have ephemeral writable storage under /tmp. Keep the original
# file-cache behavior as a warm-instance optimization without pretending it is
# durable research persistence.
DATA_DIR = Path("/tmp/digital_oliver/data_cache") if os.getenv("VERCEL") else APP_DIR / "data_cache"

MAG7 = {
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "AMZN": "Amazon",
    "META": "Meta",
    "GOOGL": "Alphabet",
    "TSLA": "Tesla",
}

TIMEFRAMES = ("15m", "5m", "1m")
DEFAULT_REVIEW_TIMEFRAME = "5m"
