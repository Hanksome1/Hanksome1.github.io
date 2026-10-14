---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: QM operation
date: '2026-09-16'
updated: '2026-09-19 15:45:42'
tags:
  - QM
  - Math
permalink: notes/qm-operation/
synced: obsidian
---

# Quantum Operation 

### Discrete Dimension 
> For finite space 

![[Finite Dimension Quantum State.svg]]
先用finite dimension去理解，假設這邊的每個位置都有可能會有particle出現，但是Particle只會出現在某一個position。

我們會用$\psi=\begin{pmatrix}\psi_{0} \\  \psi_{1} \\  \psi_{2} \\  \psi_{3}\end{pmatrix}$表示quantum status，如果 $\psi_{0}$是1就代表他出現在這的位置。

假設出現在 x=0 我們表示為
$$
\ket{ 0} = \begin{pmatrix}
1 \\
0 \\
0 \\
0
\end{pmatrix}  , \ket{1} = \begin{pmatrix}
0  \\
1 \\
0 \\
0 \\

\end{pmatrix}
$$
類似是用one hot encoding的方式表示每一個位置

先介紹一個新的operation，$\hat{X}$ Operation，這個operation會把原本的one hot encoding對應到他在真實世界中的坐標系

$$
\begin{align}
& \hat{X} \ket{0}  = 0 \ket{0} \\
& \hat{X} \ket{1} = a \ket{1} \\
& \hat{X} \ket{2} = 2a \ket{2}  \\
& \hat{X} \ket{3} = 3a \ket{3}  
\end{align}
$$
類似這樣，只要經過X hat operation，就可以把這個位置真實的座標變成 **scalar**。
而這邊的$\hat{X}$就可以用這樣表示
$$
\hat{X} = \begin{pmatrix}
0 &  0 &  0 &  0  \\
0  & a &  0 &  0  \\
0  & 0 & 2a & 0  \\
0 & 0 & 0 & 3a 
\end{pmatrix}
$$

> [!note] vector 跟 scalar
> 這邊後面講到的vector基本上都是指在hilbert space的state。而這邊提到的operation基本上都是想要透過這些operation把hilbert space的資訊算回到real world space。

##### Completeness 
$$
\sum_{n} \ket{n} \bra{n}  = I _{4\times4}
$$
##### Divide to different basis 
$$
\ket{\psi}  = I \ket{ \psi}  = \sum_{m} \ket{n} \braket{n|\psi} = \sum_{m} \psi_{n}\ket{n}  
$$

---

### Expand to Infinite Dimension 
> Expand to Hilbert space !

這邊的vector就是無限多為的vector，像是這樣。
$$\ket{x} = \begin{pmatrix}0 \\  0 \\  \dots \\  1 \\  \dots \\  0\end{pmatrix}$$

即使是這樣，先前提到的性質依舊會成立：
$$
\begin{align}
\braket{ x' | x }  = \delta(x-x')  \\
\int dx \ket{x} \bra{x}  = I 
\end{align}
$$
$$
\ket{\psi}  = I \ket{\psi} = \int dx \ket{x} \braket{x|\psi} = \int \psi(x)\ket{x} dx  
$$
其中 $\psi(x)$就是我們熟知的 wave function。他真的就變成是一個x的function的形式
很像是把原本的hilbert space抽線的vector轉換到真實世界中的橋樑。

> [!note] 關於vector的觀念
> 這邊看到的所有$\ket{x}$都是basis，就是在某個位置會是1，其他都是0。
> 而$\ket{\psi}$則是在不同地方會有不同的值，所以對x做內機就是在看在這個位置wavefunction的量值大小。
> $$
> \begin{align}
> \ket{x}  = \begin{pmatrix}  0 \\  \dots \\  1 \\  \dots \\  0\end{pmatrix}, 
> \ket{\psi}  = \begin{pmatrix}
> \psi_{1} \\
> \psi_{2} \\
> \dots \\ 
> \dots \\
> \psi_{n}
> \end{pmatrix}  \\
> \braket{ x | \psi }  = \begin{pmatrix}    
> 0 &   \dots  & 1 & \dots & 0 
> \end{pmatrix}  
> \begin{pmatrix}
> \psi_{1} \\
> \psi_{2} \\
> \dots \\
> \psi_{k}\\
> \dots \\
> \psi_{n} 
> \end{pmatrix} 
> = \psi_{k}
> \end{align}
> $$
> 因為有無限多維度，且norm=1，所以通常每個點的機率都會很小，所以真正在計算都會用積分去計算比較多，就會利用到下面的式子
> $$
> \ket{\psi}  = I \ket{\psi} = \int dx \ket{x} \braket{x|\psi} = \int \psi(x)\ket{x} dx  
> $$
> 

##### Operation in Hilbert Space 
$$
\braket{ x | \hat{A} | \psi } = \int dx' \braket{ x | A | x'  } \braket{ x' | \psi }  = \int dx' A_{(x,x')} \psi(x')
$$

原本的A operation是對hilbert space的psi vector做操作，但是這樣轉換就可以變成是對wavefunction的linear transformation(matrix operation)。

---

# Common Operator 
1. $\hat{X}$ Operator : 位置的operator，將位置資訊加入到basis, wave function上面
2. $\hat{D}$ Operator : 微分的operator，對wave function微分
3. $\hat{K}$ Operator : wave number operator

### $\hat{X}$ Operation 
$$
\hat{X} \ket{x}  = x \ket{x}  
$$
$\hat{X}$的運作概念就是可以得到某一個basis的x座標（因為hilbert space裡面的每一個basis都對應到3D空間中的某一個點），所以可以透過這個$\hat{X}$ Operation知道這一個 $\ket{x}$實際上的位置在哪裡
$$
\braket{ x' | \hat{X} |x } = x \braket{ x' | x }  = x \delta(x-x') 
$$
$$
\braket{ x |  \hat{X} | \psi} = x \braket{ x | \psi } = x \psi(x)  
$$
上面的運算可以這樣做是因為$\hat{X}$是Hermitian Matrix，所以他可以先對前面的$\bra{x}$做運算。

> [!math-blue] X is Hermitian Matrix 
> $$
> \begin{align}
>   \ket{\psi}  = I \ket{\psi} &= \int dx \ket{x} \braket{x|\psi} = \int \psi(x)\ket{x} dx   \\
> & \to \hat{X} ^{\dagger} = \hat{X}
> \end{align}
> $$

Formation of $\hat{X}$ Operation 
$$
\hat{X} = \begin{pmatrix}
X_{0}  & 0 &  \dots &  \dots & \dots &  0 \\
0  & X_{1} & \dots & \dots & \dots&  0 \\  
0  & 0  & \dots  & X_{k} &  \dots & 0  \\
\end{pmatrix}
$$
### $\hat{D}$ Operation 
$\hat{D}$ Operation就是微分的運算符，運作的方式大概如下（但是我還是不太確定他的矩陣表示方式是什麼）
$$
\braket{ x|\hat{D} | \psi }  = \braket{ x | \frac{d\psi}{dx} } = \frac{d\psi(x)}{dx} 
$$

> [!math-cyan] $\hat{D}$ Operation is not Hermitian Matrix 
> $$
> 	\braket{ \phi | \hat{D} | \psi } = \int_{-\infty}^{\infty} dx \phi ^{*} \frac{d\psi(x)}{dx}  = \phi ^{*}\psi | _{-\infty} ^{\infty} - \int _{-\infty}^{\infty}dx \psi(x) \frac{d\phi^{*}}{dx} = -\braket{ \phi | \hat{D}^{\dagger}|\psi }
> $$
> $$
> 	\hat{D}^{\dagger} = -\hat{D}
> $$
> - 所以可以知道其實$\hat{D}$是一個anti Hermition的Operation，但是通常我們希望matrix會是Hermitian Matrix，所以通常我們會把這個matrix乘以虛數，這樣這個負號就會被抵銷掉。
> - 上面的算是其實有一個boundary conditon，也就是$\phi ^{*}\psi|^{\infty}_{\infty}=0$，但是這邊先假設這個成立
> > 	



### $\hat{K}$ Operation 
K就是把原本的D Operation乘上一個$-i$ 
$$
\hat{K} = -i \hat{D}
$$
這樣一來$\hat{K}$就變成是Hermitian Matrix，也就是說$\hat{K} = \hat{K}^{\dagger}$ 
而K的用途是可以用來計算wave number (就是沿著波傳遞的方向的波的數量)
$$
\hat{K}\ket{k}  = k \ket{k}  
$$
$$
\braket{ k | k' }  = \delta (k-k')
$$
> [!math-red] What is wave number 
> wave number就是wave的密集程度，也就可以表達為波長的導數
> $$
> k = \frac{2\pi}{\lambda}
> $$

> [!math-purple] Two Basis 
> 這邊的$\ket{k}$也是一組basis，但是跟剛剛的$\ket{x}$並不一樣，這邊的$\ket{k}$是用來描述wave的state。
> 結論來說$\ket{x}$主要用來提取位置資訊的basis，而$\ket{k}$主要是用來提取波動模式的basis
> $$
> \begin{align}
> \braket{ x | \psi } = \psi(x) \\
> \braket{ k  | \psi  }  = \psi(k)
> \end{align}
> $$
> 用$\hat{X}$可以提取出位置資訊$x$, 而使用$\hat{K}$可以提取出wave number，也就是震動的頻率
> 
> 更簡單的解釋可以這樣想：
> - 第一個式子可能可以算出某一個特定位置的wave function，$\psi(5)$就是在$x=5$這個地方的震動方式
> - 第二個式子則是計算整個震動的走向大概是怎麼樣，$\psi(k)$就是在看wavenumber = k 的這個波出現的量值是多少

$$
\psi_{k}(x) = \braket{ x | k } 
$$

其中可以想像為 $\psi_{k}$就是eigen value(wave number)是k的這個wave在hilbert space的space。

目前我們還不知道$\psi_{k}(x)$到底要怎麼表示，但是我們可以透過下面的恆等式計算
$$
\begin{align}
& \braket{ x | \hat{K}|k }  = k \braket{ x | k }  = k \psi _{k} \\
& \braket{ x | \hat{K}|k }  = \braket{ x | -i\hat{D}|\psi_{k} } = -i \braket{ x | \hat{D} | \psi_{x}} = -i \frac{d\psi_{k}}{dx}   \\
& \implies k\psi_{k} = -i \frac{d\psi_{k}}{dx}
\end{align}
$$
解這個常微分方程：
$$
 \implies  \psi_{k}(x) = ce^{ikx}  
$$


--- 
# Commutator 
[[QM Math#Commute]]
$$
\begin{align}
[\hat{X},\hat{D}] = \hat{X}\hat{D}-\hat{D}\hat{X} = -I  \\
[\hat{X},\hat{K}] = \hat{K}\hat{D}-\hat{D}\hat{K} = -i 
\end{align}
$$

> [!math-green] Derivation 
> $$
> \begin{align}  
> & \braket{ x | \hat{X}\hat{D}| \psi }  = \braket{ x | \hat{X} | \frac{d\psi}{dx} }  = x \frac{d\psi}{dx} \\
> & \braket{ x | \hat{D}\hat{X}| \psi }  = \braket{ x  | \hat{D}|x\psi  }  = \psi+x\frac{d\psi}{dx} \\
>  \implies & \braket{ x|[\hat{X}\hat{D}-\hat{D}\hat{X}] | \psi }  = \braket{ x | I|\psi } \implies \braket{ x | [\hat{X},\hat{D}]-I |\psi} = 0   
> \end{align}
> $$
