"""SignTransformer — Transformer encoder nhỏ phân loại chuỗi landmark.

Lựa chọn theo khảo sát đã xác minh (07/2026): transformer-trên-landmark là điểm
cân bằng accuracy/độ phức tạp tốt nhất cho 100-200 gloss (SPOTER làm mốc, kiến trúc
1D-CNN+Transformer của Kaggle GISLR 1st place là đích nâng cấp; GCN bị loại —
phức tạp hơn nhiều, lợi ích nhỏ ở quy mô này).
"""

from __future__ import annotations

import torch
from torch import nn


class SignTransformer(nn.Module):

    def __init__(
        self,
        num_classes: int,
        input_dims: int = 144,
        d_model: int = 192,
        num_layers: int = 4,
        num_heads: int = 4,
        max_len: int = 64,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.input_proj = nn.Sequential(
            nn.Linear(input_dims, d_model),
            nn.LayerNorm(d_model),
        )
        self.pos_embedding = nn.Parameter(torch.zeros(1, max_len, d_model))
        nn.init.trunc_normal_(self.pos_embedding, std=0.02)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=num_heads,
            dim_feedforward=d_model * 2,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.head = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Dropout(dropout),
            nn.Linear(d_model, num_classes),
        )

    def forward(self, x: torch.Tensor, mask: torch.Tensor | None = None) -> torch.Tensor:
        """x: (B, T, 144); mask: (B, T) bool, True = frame hợp lệ. Trả logits (B, C)."""
        h = self.input_proj(x) + self.pos_embedding[:, : x.size(1)]
        padding_mask = None if mask is None else ~mask  # PyTorch: True = vị trí bị che
        h = self.encoder(h, src_key_padding_mask=padding_mask)

        if mask is None:
            pooled = h.mean(dim=1)
        else:
            weights = mask.unsqueeze(-1).float()
            pooled = (h * weights).sum(dim=1) / weights.sum(dim=1).clamp(min=1.0)
        return self.head(pooled)


class ExportWrapper(nn.Module):
    """Bọc model cho ONNX: serve luôn gửi cửa sổ đủ T frame nên bỏ mask cho đơn giản."""

    def __init__(self, model: SignTransformer):
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.model(x, mask=None), dim=-1)
