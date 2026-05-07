"""
Wrapper that patches torchaudio.load with soundfile before running demucs.
Required because torchaudio 2.6+ uses torchcodec which has no Windows wheel.
"""
import sys
import numpy as np
import soundfile as sf
import torch
import torchaudio


def _sf_load(filepath, *args, **kwargs):
    data, rate = sf.read(str(filepath), dtype="float32", always_2d=True)
    return torch.from_numpy(np.ascontiguousarray(data.T)), rate


torchaudio.load = _sf_load

from demucs.__main__ import main  # noqa: E402
sys.exit(main())
