#!/usr/bin/env bash
# h5 (Keras 3) -> Keras 2 h5 -> TF.js layers model in public/models/form/
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/bin/python - <<'PY'
import sys; sys.path.insert(0, "scripts")
from keras_model import build_model
m = build_model(); m.save("scripts/pushup_form_keras2.h5"); print(m.count_params(), "params")
PY
.venv/bin/tensorflowjs_converter --input_format keras scripts/pushup_form_keras2.h5 public/models/form
ls -la public/models/form
