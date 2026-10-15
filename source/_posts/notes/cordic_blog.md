---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: CORDIC：只用移位和加法算三角函數與 exp
date: '2025-11-17'
updated: '2026-10-16 00:26:08'
tags:
  - ICLAB
  - Math
  - Accelerator
summary: CORDIC 把一次旋轉拆成一連串角度為 arctan(2⁻ⁱ) 的小旋轉，每一步只需要移位和加減法。圓周模式算 sin、cos，雙曲模式算 cosh、sinh，進而得到 eˣ。
permalink: notes/cordic/
synced: obsidian
---

CORDIC（COordinate Rotation DIgital Computer）是為了在硬體上算 sin、cos 這類函數而發展出來的演算法。它的想法是只用電腦很好算的操作（右移就是除以 2、加法、減法），一步一步逼近正確的值。

## 圓周模式：sin 與 cos

把向量 $(x, y)$ 旋轉 $\theta$：

$$
\begin{bmatrix} x' \\ y' \end{bmatrix} =
\begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix}
\begin{bmatrix} x \\ y \end{bmatrix} =
\cos\theta
\begin{bmatrix} 1 & -\tan\theta \\ \tan\theta & 1 \end{bmatrix}
\begin{bmatrix} x \\ y \end{bmatrix}
$$

如果只用滿足 $\tan\theta_i = 2^{-i}$ 的角度，乘以 $\tan\theta_i$ 就變成右移 $i$ 個 bit。任意角度都可以拆成這些小角度的加減，$\theta \approx \sum_i d_i \theta_i$，$d_i \in \{+1, -1\}$。每一步的迭代是：

$$
\begin{aligned}
x_{i+1} &= x_i - d_i \, y_i \, 2^{-i} \\
y_{i+1} &= y_i + d_i \, x_i \, 2^{-i} \\
z_{i+1} &= z_i - d_i \arctan\left(2^{-i}\right)
\end{aligned}
$$

$z$ 記錄還剩多少角度沒轉，$d_i = \operatorname{sign}(z_i)$，也就是每一步都往讓 $z$ 歸零的方向轉。$\arctan(2^{-i})$ 預先算好，存成一張小表。

每一步省略掉的 $\cos\theta_i$ 會累積成一個固定的增益：

$$
K = \prod_{i=0}^{n-1} \cos\theta_i = \prod_{i=0}^{n-1} \frac{1}{\sqrt{1 + 2^{-2i}}} \approx 0.6073
$$

所以初始值設成 $x_0 = K$、$y_0 = 0$、$z_0 = \theta$，跑完 $n$ 步之後 $x_n \approx \cos\theta$、$y_n \approx \sin\theta$。每多迭代一次，大約多得到 1 bit 的精度。

所有小角度加起來是 $\sum_{i \ge 0} \arctan(2^{-i}) \approx 1.743$ rad（約 99.9°），這就是能收斂的範圍；超過的角度要先用三角函數的對稱性折回來。

## 雙曲模式：$e^x$

$$
e^x = \cosh x + \sinh x
$$

這個等式對所有的 $x$ 都成立，所以只要算出 $\cosh x$ 和 $\sinh x$ 就好。把 CORDIC 換成雙曲旋轉：

$$
\begin{aligned}
x_{i+1} &= x_i + d_i \, y_i \, 2^{-i} \\
y_{i+1} &= y_i + d_i \, x_i \, 2^{-i} \\
z_{i+1} &= z_i - d_i \operatorname{artanh}\left(2^{-i}\right)
\end{aligned}
$$

和圓周模式有兩個差別：

- $i$ 從 1 開始，因為 $\operatorname{artanh}(1)$ 是無限大。
- 第 4、13、40、… 次迭代（$i_{k+1} = 3 i_k + 1$）要重複做一次，否則不會收斂。

這時的增益是 $K_h = \prod_i \sqrt{1 - 2^{-2i}} \approx 0.8282$（包含重複的那幾次）。初始值設成 $x_0 = 1/K_h \approx 1.2075$、$y_0 = 0$、$z_0 = x$，跑完之後 $x_n \approx \cosh x$、$y_n \approx \sinh x$，兩者相加就是 $e^x$。

雙曲模式能收斂的範圍只有 $|x| \lesssim 1.118$，這個限制來自 CORDIC 的迭代，不是公式本身。範圍外的 $x$ 可以先拆成 $x = k \ln 2 + r$：

$$
e^x = 2^k \, e^r
$$

$e^r$ 交給 CORDIC，乘上 $2^k$ 只是移位。

這是做 [[ICLAB_HW5_blog|HW5]] 的 softmax 時讀到的方法。延伸閱讀：[Moroz 等人整理的 CORDIC 方法（PDF）](https://repozytorium.biblos.pk.edu.pl/redo/resources/28202/file/suwFiles/MorozL_CordicMethod.pdf)。
