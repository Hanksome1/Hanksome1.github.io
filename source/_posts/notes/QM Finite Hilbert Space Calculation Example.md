---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: QM Finite Hilbert Space Calculation Example
date: '2026-09-26'
updated: '2026-10-01 14:44:56'
tags:
  - QM
permalink: notes/qm-finite-hilbert-space-calculation-example/
synced: obsidian
---

# QM Example 
Problem about boron atom
![[Pasted image 20260926194923.png]]
軌域是：$1s^{2}2s^{2}2p^{1}$，在這邊我們就只探討最外圍的電子，因為這電子是唯一自由的電子。他有三個不同的軌域，分別是往x,y,z三個方向的軌域。
![[Pasted image 20260926160152.png]]

根據 [[QM Quantum Postulate]] 的 QM1，我們可以用三個不同的state表示這三個不同的軌域。
$$

\begin{align}
 & \ket{2p_{x}}  \begin{pmatrix}
1 \\
0 \\
0
\end{pmatrix} , 
\ket{2p_{y}}  \begin{pmatrix}
0 \\
1 \\
0
\end{pmatrix} , 
\ket{2p_{z}}  \begin{pmatrix}
0 \\
0 \\
1
\end{pmatrix} ,  \\

& \ket{\psi}  \begin{pmatrix}
\psi_{1} \\
\psi_{2} \\
\psi_{3}
\end{pmatrix} \implies \text{Quantum Postulate } 
\end{align}
$$
題目的假設是給予一個在y方向的磁場B，先稍微提一下最後算完的結果，原本在沒有磁場之前，每一個軌域的能量是一樣的，但是在加入磁場之後每一個軌域的能量會改變。

$$
\hat{H}_{Boron} \approx -\vec{m} \cdot \vec{B} = \frac{\mu_{B}}{\hbar }\vec{L}\cdot \vec{B} = \omega_{L} \vec{L_{y}}
$$
in which $\omega_{L}$ is the larmor frequency .

### $\hat{L}$ Operation 
L 就是用來計算角動量的operator
$$
\begin{align}
 & L_{x} = \begin{pmatrix}
0 & \frac{1}{\sqrt{ 2 } }  & 0 \\
\frac{1}{\sqrt{ 2 }}  & 0  & \frac{1}{\sqrt{ 2 }} \\ 
0  & \frac{1}{\sqrt{ 2 }} & 0
\end{pmatrix}
\hat{h} \\

 & L_{y} = \begin{pmatrix}
0 & -\frac{i}{\sqrt{ 2 } }  & 0 \\
\frac{i}{\sqrt{ 2 }}  & 0  & -\frac{i}{\sqrt{ 2 }} \\ 
0  & \frac{i}{\sqrt{ 2 }} & 0
\end{pmatrix}
\hat{h} \\

 & L_{z} = \begin{pmatrix}
 1 & 0 & 0 \\
 0 & 0 & 0  \\
 0 & 0 & -1
\end{pmatrix}
\hat{h} \\

\end{align}
$$

---

### Example 
Take $\hat{L}_{y}$ as an example 
![[Screenshot 2026-09-26 at 8.21.47 PM.png]]

for another example, $\hat{L}_{z}$
$$
\begin{align}
 & L_{z} = \hat{h} \to \begin{pmatrix}
1 \\
0 \\
0
\end{pmatrix}  = \ket{+1_{z}} \\

 & L_{z} = 0 \to \begin{pmatrix}
0 \\
0 \\
0
\end{pmatrix} = \ket{0_{z}}  \\

 & L_{z} = -h  \to \begin{pmatrix}
0 \\
0 \\
1
\end{pmatrix} = \ket{-1_{z}} 
\end{align}
$$

---

### Naive Result 
![[Screenshot 2026-09-26 at 8.32.56 PM.png]]

可以看到原本三個軌域的energy在附近，但是經過磁場操作之後就會把能量拉開。

###### Shordinger Equation 
$$
\hat{H}_{Boron}\ket{\psi}  = i\hat{h} \frac{ \partial  }{ \partial t } \ket{\psi} 
$$
Assume $\ket{\psi}$ is an eigenstate of $\hat{H}_{Boron}$（在後面會推廣到geenratl case）
$$
\implies \hat{H}_{Boron}\ket{\psi}  = E \ket{\psi} 
$$
The equation is simplified and can be solved 
$$
i\hat{h} \frac{ \partial  }{ \partial t } \ket{\psi}  = E \ket{\psi} \implies \ket{\psi(t)}  = \ket{\psi(0)} e ^{-iE/\hat{h}t}
$$

Example solution will be like 
$$
\begin{align}
 & \ket{\psi(0)} = \ket{+1_{y}}  \\
 & \ket{\psi(t)} = \ket{+1_{y}} e^{i\omega_{L}t} = \begin{pmatrix}
-\frac{1}{2}  \\
\frac{i}{\sqrt{ 2 }} \\
\frac{1}{2}
\end{pmatrix} e^{-i\omega_{L}t }
\end{align}
$$
結果就是假設一開始是在 y的eiganstate上面，他就會用 $e^{-i\omega_{L}t}=\cos(\omega_{L}t)+i\sin(\omega_{L})$ 轉動


---

### General Solution of this problem 
上面的解法的假設是假設$\ket{\psi}$跟$H$是eigenstate的關係。所以這邊把它用completeness把state拆分成對於這個操作的所有eigenstate。
$$
\hat{H} _{Boron} \to E_{\alpha} \ket{\alpha}  , \sum_{\alpha} \ket{\alpha} \bra{\alpha} = I
$$
拆解initial state的階段：
$$
\ket{\psi(0)}  = \sum_{\alpha} \ket{\alpha} \braket{ \alpha | \psi(0) } = \sum_{\alpha} c_{\alpha } \ket{\alpha}     
$$
因為這邊我們已經把他的$\psi$用不同的eigenstate表示，所以我們可以重新表示成這樣，又因為所有basis的操作都是獨立的，所以我們可以直接把剛剛推倒的結論帶進來
$$
\ket{\psi(t)} = \sum_{\alpha} c_{\alpha} e^{iE_{\alpha}/\hat{h} t} \ket{\alpha} 
$$
##### Propagator v(t)
$$
\begin{align}
\ket{\psi(t)}  & =  \sum_{\alpha} c_{\alpha} e^{-i (E_{\alpha}/\hat{h})t} \ket{\alpha }  \\
 & = \sum_{\alpha} e^{-i (E_{\alpha}/\hat{h})t} \ket{\alpha} \braket{\alpha|\psi(0)}    \\
 & = e^{-i (E_{\alpha}/\hat{h})t} \sum_{\alpha}  \ket{\alpha} \braket{\alpha|\psi(0)} \\
 & = e^{-i (E_{\alpha}/\hat{h})t} \ket{\psi(0)}  \\
 & = v(t) \ket{\psi(0)} 
\end{align}
$$
因此我們會將$e^{-i (E_{\alpha}/\hat{h})t}$用 $v(t)$表示，我們稱為propagator。

---

### Back into B atom case
假設從$\ket{\psi(0)} =\ket{+1_{z}}$開始。
因為我們的操作是沿著y dimension，所以我們要先把它使用Ly Operator的eigenstate。

$$
\ket{\psi(0)}  = -\frac{1}{2} \ket{+1_{y}} + \frac{1}{\sqrt{ 2 }} \ket{0_{y}} -\frac{1}{2} \ket{-1_{y}} 
$$
$$
\begin{align}
\ket{\psi(t)}  =  &  -\frac{1}{2} \ket{+1_{y}} \cdot e^{-i\omega_{L}t} \\
 & + \frac{1}{\sqrt{ 2 }} \ket{0_{y}} \cdot 1\\
 & -\frac{1}{2 } \ket{-1_{y}} \cdot e^{i\omega_{L}t} 
\end{align}
$$


The result is
$$
\ket{\psi(t)} = \begin{pmatrix}
\frac{1}{2} + \frac{1}{2} \cos \omega_{L}t  \\
-\frac{1}{\sqrt{ 2 }} \sin\omega_{L}t  \\
\frac{1}{2} - \frac{1}{2}\cos\omega_{L}t 
\end{pmatrix}
$$
計算expectation values 
$$
\begin{align}
\braket{ \psi(t) | \hat{L}_{z}|\psi(t) } =  & \left\lvert  \frac{1}{2} + \frac{1}{2} \cos \omega_{L}t   \right\rvert ^{2} \cdot \hat{h} \\
 & + \left\lvert  \frac{1}{\sqrt{ 2 }} \sin\omega_{L}t \right\rvert ^{2} \cdot 0  \\
 & + \left\lvert  \frac{1}{2} - \frac{1}{2} \cos \omega_{L}t  \right\rvert ^{2} \cdot (-\hat{h})
\end{align}
$$
$$
\braket{ \psi(t) | \hat{L}_{z}|\psi(t) } = \hat{h}\cos(\omega_{L}t)
$$
$$
\braket{ \psi(t) | \hat{L}_{x}|\psi(t) } = \hat{h}\sin(\omega_{L}t)
$$

所以最後運動的方式可以想像成是繞著y軸做旋轉，剛好符合電磁學（右手定則）的宏觀現象。
- semi-classic phenomenon
