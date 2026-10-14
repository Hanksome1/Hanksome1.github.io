---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: QM Math
date: '2026-09-12'
updated: '2026-10-02 10:00:34'
tags:
  - QM
  - Math
permalink: notes/qm-math/
synced: obsidian
---

$$
\psi(x,y,z,t) = \braket{ x,y,z | \psi(t) } 
$$
> Invented by Direc.  
### Notation 
- bra : row vector 
$$
\bra{\psi}  = 
\begin{pmatrix}
0 \\
1 \\
0
\end{pmatrix}
$$
- ket : column vector 
$$
\ket{\psi} = \begin{pmatrix}
0 & 1 & 0
\end{pmatrix} 
$$


# Operation
braket is the inner product of two vector, ketbra is the outer product of two vector. 

$$

\begin{align*}
\bra{\psi}  = \begin{pmatrix}
\psi_{1}  \\
\psi_{2} \\
\psi_{3}
\end{pmatrix}
, \ket{\phi}  = \begin{pmatrix}
\phi_{1}^{*}  & \phi_{2}^{*}  & \phi_{3}^{*}
\end{pmatrix} \\
\braket{ \psi | \phi }  = \psi_{1}\phi_{1}^{*}  + \psi_{2}\phi_{2}^{*} + \psi_{3}\phi_{3}^{*} \\
\ket{\psi} \bra{\phi} = \begin{pmatrix}
\psi_{1}\phi_{1}^{*}  & \dots & \dots \\
\psi_{2}\phi_{1}^{*} & \dots & \dots \\
\psi_{3}\phi_{3}^{*} & \dots & \dots
\end{pmatrix}   
\end{align*}

$$


- bracket : inner product -> output is scalar 
- ketbra : outer product -> create matrix
### Transformation Between Bra and Ket 
Turning bra into ket is **Doing Transpose and conjugate.** 
$$
\bra{\psi} = \ket{\psi}^{*T}  = \begin{pmatrix}
\psi_{1}^{*}  & \psi_{2}^{*}  & \psi_{3}^{*}
\end{pmatrix}
$$

Change the order of braket need to add additional conjugate, **skew-symmetry**
$$
\braket{ V | W }  = \braket{ W | V } ^{*}
$$
The braket of itself is the norm of this vector. 
$$
\braket{ \psi | \psi } = \lvert \psi \rvert ^{2}  
$$

### Note From Textbook 
$$
a\ket{V}  = \bra{V} a^{*} 
$$
$$
\bra{aV}  = \bra{V} a^{*} 
$$
### Gram-Schmidt Theorem
- Linear independent basis : the basis span the n dimension world
	- cannot find any linear combination of these basis to create 0 vector. 
- Orthogonal basis : each basis is orthogonal to each other. 

To turn linear independent basis into orthoogal basis : 
1. Rescale the first by its own length, so it becomes a unit vector. This will be the  first basis vector.
2. Subtract from the second vector its projection along the first, leaving behind only  the part perpendicular to the first. (Such a part will remain since by assumption the vectors are nonparallel.)
3. Rescale the left over piece by its own length. We now have the second basis vector:  it is orthogonal to the first and of unit length.

> [!note] 實際做法
> 簡單來說就是當我們已經有basis之後，要將她變成垂直的basis就是先取第一個當作基準，然後將第二個basis投影到他上面（這樣就知道第二個vector有多少是第一個basis的切線分量），之後再把這個分量剪掉就好了（用內積投影就好了）
> $$
> \ket{2'} = \ket{II} - \ket{1} \braket{ 1 | II }  
> $$


### Projection Operator 
$$
P_i= \ket{i} \bra{i} 
$$
這個矩陣有一些特殊的功能，可以將vector投影到特定的basis向量。
$$
P_{i}\ket{V}  = \ket{i} \braket {i|V}    
$$
只留下V vector在i方向的分量。

Identity matrix跟projection matrix之間的關係：
$$
I = \sum_{i} P_{i} = \sum_{i} \ket{i} \bra{i} 
$$
##### Property of projection matrix 
$$
P_{i}^{2} = P_{i}
$$
因為projection matrix是針對i方向做投影，所以不管做幾次都一樣。
$$
P_{i}P_{j} = 0 
$$
如果對兩個方向分別做一次projection就會得到0 matrix。

##### Usage of decomposition 
$$
\braket{ a | AB|b } = \braket{ a | AIB |b } = \braket{ a | A \left( \sum_{i}\ket{i} \bra{i}  \right)B|b }    = \sum_{i} \braket{ a | A| i} \braket{ i | B|b }  
$$
這樣就可以在兩個operation中間插入一個新的basis，也可以把兩個operation分開來做。
### Presentation of Matrix Element 
假設以下是一個operation. 
$$
\Omega A  
$$
Matrix element就可以表示為：
$$
(\Omega A)_{ij} = \braket{ i | \Omega A|j  }  
$$

---

### Adjoint (Dagger)
- 先transpose 
- 再conjugate 
bra -> ket的轉換是vector的轉換，dagger就是將這套規則到用到matrix上面
$$
\Omega  = \begin{pmatrix}
a & b \\
 c & d
\end{pmatrix}  \to \Omega ^{\dagger} = \begin{pmatrix}
a ^{*} & c ^{*} \\
b ^{*} & d ^{*}
\end{pmatrix}
$$
$$
(AB) ^{\dagger} = B^{\dagger} A ^{\dagger}
$$
運算跟矩陣inverse的性質有一點像

---

### Hermitian Matrix 
- An operator $\Omega$ is Hermitian if $\Omega ^{\dagger} = \Omega$
- An operator $\Omega$ is anti-Hermitian if $\Omega ^{\dagger} = -\Omega$

Any matrix can be decomposed into hermitian matrix and anti-hermitian matrix 
$$
\Omega = \frac{\Omega + \Omega ^{\dagger}}{2} + \frac{\Omega - \Omega ^{\dagger}}{2}
$$
其中：$\frac{\Omega + \Omega ^{\dagger}}{2}$ 就會是hermitian matrix，$\frac{\Omega - \Omega ^{\dagger}}{2}$ 則是anti-hermitian matrix 
- Hermitian Matrix的eigan value一定是real
### Unitary Matrix 
$$
U U ^{\dagger} = I 
$$
一個經典的例子就是rotation matrix 
$$
R(\theta) = \begin{pmatrix}
\cos(\theta) & -\sin(\theta)  & 0 \\
\sin(\theta) & \cos(\theta)  & 0 \\
0 & 0 & 1
\end{pmatrix}
$$
這個matrix就符合$R R^{T} = RR ^{\dagger} = I$


---

### Commute 
Commute 就是交換律的意思，但是在量子力學中很多運算是沒有commute的，但是兩個運算間依舊會有一些關係，所以會用commute \[Operation1,Operation2\] 來表示
$$
[\hat{X}, \hat{D}] = \hat{X}\hat{D} - \hat{D}\hat{X}
$$
