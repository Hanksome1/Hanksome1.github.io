---
# 從舊站（2023，Hexo + Fluid）搬過來的文章，permalink 保留舊網址
title: Reverse_Assembly
date: 2023-09-24 11:54:00
tags:
  - Reverse
permalink: 2023/09/24/Reverse-Assembly/
---

# Reverse

This article is mostly about the basic knowledge of
assembly.Including some basic instruction, calling convention and a lot
more. There might have dozens of grammar mistake. Please tell me if you
find any.
註:大部分筆記都是在我用虛擬機的時候打的，因為在虛擬機不想要一直切換輸入法，所以虛擬機中只有英文，請多多見諒。

## Register

Most register don't have specific function. While `ESP`
and `EBP` have specific function.

- **ESP**: stack pointer.
- **EBP**: base pointer.
- **rip**: the instruction pointer, point to the next
intruction.
- **rsp**: the stack pointer, point to the top of the
stack. `EAX(32bits)` can be viewed as two
`AX(16bits)` combine together. and the higher part of
`AX` is `AH(bits)`, while the lower part of
`AX` is `AL(bits)`.

# Assembly

### Declaration of static data

use `data` to start declaration data. `.byte`,
`short`, `long`, are instruction of declaration,
which decide how many memory will this variable take. `byte`:
one byte. `short`: two byte. `long`: four byte.
`zero`: to setup series of zero.

```c
.data
    barr:
           .zero 10; // declaring ten bytes of zero right afer the position of the label.
    var :
           .byte 64 ;declare var, and the data is 64
           .byte 10 ;declare a nother data 10, this data have no so-called label, the address is var+1.
       
```

## commands

### the operating suffix:

a given memory address of the data types from referenced Assembly
instructions inferred. However, in some cases, we use the memory in the
“ pit “ of the size is not clear. Say this Directive mov
`$2,(%ebx)`. This Directive whether it should be “ 2 “ for
this value to move to EBX in value represents the address of the “ pit “
of a single byte ? Perhaps it is represented by a 32-bit integer
representation of 2 is moved to the From address EBX beginning of the 4
bytes. Since these two explanations are plausible, but computer
assembler must be clear which explanation is correct, the computer is
very simple, either is wrong or right. Prefix `b`,
`w`, and `l` is to solve this problem, which are
denoted 1, 2 and 4 bytes in size. ## Data Movement Instruction

### move:

this command basically copy the data of the first parameter, and
cover the data of the second parameter.

```llvm
mov (%ebx), %eax; move the data inside ebx into eax. (%eax) means the data stored inside eax
mov (%ebx), var; move four bytes of data inside ebx into var. 
mov (%esi, %ebx, 4), ESI; To move the four bytes of data, which starts from ESI+4*EBX, into EDX; 
```

:warning: Noted
that if you write to a 32-bit partial(e.g. eax), the CPU will zero out
the rest of the register.

### push:

move the parameter into the top of the stack. First of all, the
number of `ESP-4`, and the `ESP` will point to the
next bytes. &gt; the stack memory is from high to low.

```arcade
push %eax; push eax into stach 
push var; push var into stack (4 bytes)
```

### pop:

remove 4 bytes of data from stack, and put into a specific parameter.
and let `ESP+4`

```livecodeserver
pop %edi; remove the data from stack, and put it into edi.
pop (%ebx); remove the data from stack, and and put it in the four bytes starting from edx.
```

&gt; stack is the
data-structure that is first in last out, last in first out.

### lea:

- Load effective address.
- lea Instruct to the first parameter specifies the memory unit into
the second parameter of the specified register. Note that this command
does not load the memory unit of the content, just calculate the
effective address and put it into the register. This is for obtaining a
pointer to a memory area of a pointer or to perform simple arithmetic
operations is very useful.
- Noted that lea is one of the few function that can directly access
the rip register.

```llvm
lea (%ebx,%esi,8), %edi ;the value of EBX+8*ESI is moved to EDI
lea val(,1), %eax ;the value of val is moved to EAX
lea eax, [rip] # load the next instruction into rax.
```

## Logical Operation
Instruction

### add:

`add` Instruction will sum up the two parameter, and the
resulted will be stored in second parameter.

```apache
add $10, %eax ;EAX 中的值被设置为了 EAX+10.
addb $10, (%eax) ;往 EAX 中的值 所代表的内存单元地址 加上 1 个字节的数字 10.
```

### sub:
subInstruction will be the second parameter value of the first
subtraction, is behind the minus in front of that, then the result is
stored to the second parameter. And addAs, both parameters can be a
register, but the two parameters can have at most one memory unit.

```perl
sub %ah, %al ;AL 被设置成 AL-AH
sub $216, %eax ;将 EAX 中的值减去 216
```

### inc, dec:

`inc` make the parameter plus 1, and `dec` make
the parameter minus 1.

### imul:

- integer multiplication
- There are two form: 2 parameter, 3parameter.

1. two parameter:the first two parameters are multiplied, then the
result is stored to the second parameter. Result of the operation ( i.e.
the second parameter ) must be a register.
1. three parameter: the first is it will be the 1st parameter and the
first 2 parameters are multiplied, then the result is stored to the
first 3 parameters, and of course, the 3rd parameter must be a register.
In addition, the 1 argument must be a constant.

```llvm
imul (%ebx), %eax ;将 EAX 中的 32 位整数, 与 EBX 中的内容所指的内存单元, 相乘, 然后把结果存到 EAX 中.
imul $25, %edi, %esi ;ESI 被设置为 EDI * 25.
```

### idiv:

- integer divider
- 此操作數為除數，而被除數則為EDX : EAX 中的內容（一個64位的整數），
除法結果( 商) 存在EAX 中, 而所得的餘數存在EDX 中.

```llvm
idiv %ebx ;用 EDX : EAX 的值除以 EBX 的值. 商存放在 EAX 中, 余数存放在 EDX 中.
idivw (%ebx) ;将 EDX : EAX 的值除以存储在 EBX 所对应内存单元的 32 位值. 商存放在 EAX 中, 余数存放在 EDX 中.
```

### and
, or , xor: These instructions are for their parameters to the
appropriate logic operation, the operation result is stored to the
**first **parameter. ### shr, shl: bitwise shift, move the
digit by the second parameter of the decision, to move after the vacancy
to get 0 up.

## Flow Control Instruction

x86 處理器有一個指令指針寄存器( EIP ), 該寄存器為32 位寄存器,
它用來在內存中指示我們輸入彙編指令的位置.
就是說這個寄存器指向哪個內存單元,
那個單元存儲的機器碼就是程序執行的指令.
通常它是指向我們程序要執行的下一條指令. 但是你不能直接操作EIP 寄存器,
你需要流程控制指令來隱式地給它賦值.

### jmp:

jump to the assigned address. And execute the code at the address.
&gt; jmp ususally jump to label.

```llvm
    mov 8(%ebp), %esi
begin:
    xor %ecx, %ecx
    mov (%esi), %eax
 ...................
 jmp begin ; jump to the begin label 
          
```

### cmp:

compare the value of two number.

```c
cmpb $10, (%ebx)
jeq loop; // if the number in ebx is equal to 10, then jump into the "loop" label.
```

### jcondition:

這些指令是條件跳轉指令, 它們基於一組條件代碼的狀態,
這些條件代碼的狀態存放在稱為機器狀態字( machine status word )
的特殊寄存器中. 機器狀態字的內容包括關於最後執行的算術運算的信息. 例如,
這個字的一個位表示最後的結果是否為0. 另一個位表示最後結果是否為負數.
基於這些條件代碼, 可以執行許多條件跳轉. 例如,
如果最後一次算術運算結果為0, 則 jz 指令就是跳轉到指定參數標籤. 否則,
程序就按照流程進入下一條指令.

許多條件分支的名稱都是很直觀的, 這些指令的運行,
都和一個特殊的比較指令有關, cmp( 見下文). 例如, 像 jle 和 jne 這種指令,
它們首先對參數進行 cmp 操作.

```c
je <label; //jump when equal; 
jne <label; //jump when not equal;
jz <label; //jump when the result is 0;
jg <label; //jump when greater;
jge <label;//jump when greater or equal;
jl <label; //jump when less;
jle <label; //jump when less or equal;
```

#### example

```c
cmp %ebx, %eax
jle done
;if the value in ebx is smaller than eax, then jump to " done " label, or execute the following instruction.
```

### call, ret:

while calling a function, the computer record the current address
into the stack. when the process is over, return will bring the EIP to
the previous address.

```c
call <label;
ret ;
```

## Calling Convention:

為了方便不同的程序員去分享代碼和運行庫, 並簡化一般子程序的使用,
程序員們通常會遵守一定的約定( Calling Convention ).
調用約定是關於如何從例程調用和返回的協議.
例如，給定一組調用約定規則，程序員不需要檢查子例程的定義來確定如何將參數傳遞給該子例程.
此外，給定一組調用約定規則，可以使高級語言編譯器遵循規則，從而允許手動編碼的彙編語言例程和高級語言例程相互調用

### Caller Rules:

1. In the subroutine call, should save some of the contents of the
register. Caller saved register are EAX, ECX, EDX. Because these
register may be used when the subroutine is running, so the value of
register should be push into stack.
1. If we want to pass some parameter to the subroutine, we should push
the parameter into stack before calling function. The last parameter
should be put into the stack first.
1. To call a subroutine, use `call` instruction.

> After return, the return value should be inside EAX. To return to
> machine state, we should 1.remove parameter from stack. 2.put the EAX,
> ECX, EDX previous value, which is put into stack previously, back into
> EAX, ECX, EDX.

### Example:

下面的代碼就是個活生生的例子, 它展示了遵循約定的函數調用.
調用者正在調用一個帶有3 個整數參數的函數myFunc. 第一個參數是EAX,
第二個參數是常數216; 第三個參數位於EBX 的值所代表的內存地址.

```c
push (%ebx) //put the third parameter into stack.
push $216 ;//put the second parameter into stack.
push %eax ; //put the first parameter into stack.
call myFunc ;//calling this function 
add $12, %esp // to move the pointer of the stack, to where there are no parameter.
```

&gt; Stack is viewed as a temperary data saver.

### Callee Rules:

subroutine should follow the some rule at the beginning of
subroutine. 1. Push the value of EBP into stack, and copy the data of
ESP into EBP. 2. Create space inside stack. Recall that stack growth
downward, therefore, we should minus the pointer to stack to create more
space.

```livecodeserver
sub $12, %esp; create 12bits of space to stack, which is the space of three words.
```

3. Callee-saved register EBX,EDI,ESI will be
retained by calling convention.

### return:

1. save the return value inside EAX.
1. Restore any modified register value.calleed saved old value.
1. release some variable, done this by adding corresponding value.
1. After returning, pop EBP in stack to restore caller's base point
value. Recall that we push the EBP when we were calling a
subroutine.
1. Through the implementation of `ret` Instruction to
return.

### Example

```c
.text;//将 myFunc 定义为全局 ( 导出 ) 函数
    .globl myFunc
    .type myFunc, @function
    myFunc :
    ;prologue
    push %ebp ;//saved the caller's base pointer
    mov %esp, %ebp ;//set new base pointer.
    sub $4, %esp ; //create 4 bytes space. 
    push %edi; 
    push %esi ;this function will modify EDI and ESI, so push them into stack.
    ;//there is no need to save EBX, EBP and ESP
    ;//main part of the subroutine
    mov 8(%ebp), %eax ;//move parameter 1 into EAX. [ebp+8] -> eax
    mov 12(%ebp), %esi ;//move second parameter into ESI. [ebp+12]->esi
    mov 16(%ebp), %edi ;//move the third parameter into EDI.
    mov %edi, -4(%ebp) ;//move EDI to temperary variable.
    add %esi, -4(%ebp) ;//add ESI to temperary variable
    add -4(%ebp), %eax ;// add the value of temperary variable to eax; 
    ; // the end of the subroutine
    pop %esi ;//restore the value of the
    pop %edi
    mov %ebp, %esp ;释放局部变量
    pop %ebp ;恢复调用者的基指针值
    ret
```

# X64 Assembler

x86-64 is the 64-bits version of x86. Most registers are general
purpopse. While some have specific function. - rsp: used as the stack
pointer. - rax: the function return value.

### setx and movx

execute the instruction if x(the condition) is true.

```
sete dst; if equal then set the dst from 0 to 1.
setge dst; if greater equal, set the dst from 0 to 1.
cmovle src, dst; if less equal ,mov the src to dst. 
```

# ELF

- ELF header: in the front of the file, describe the the basic
properties.
- Program header table: is optional, it tells the system how to create
a process image. The executable file must have a program header table,
and the relocatable files do not need.
- section:

## readelf

### analysis

a better way to use readelf, is using c++filter to change demangle
symbol name into readable symbol name.

```bash
$readelf -Ws <library> | c++filt
```

### find dependant libraries

can simply use ldd to find out, or usign readelf and grep command.

```bash
$readelf -d <executable binary|library> | grep NEEDED
```

# Memory

In order to use the user program in the runtime has a private address
space, has its own CPU, just like the exclusivity of the entire computer
as a modern operating system proposes the virtual memory concept.

## Stack

Is the First In First Out(FIFO) volume. Stack grow from high memory
address to low memory address, `ebp` is pointed to the botton
of the stack, while `esp` is pointed to the top of the stack.
- `Push`: `esp` will minus, and put the operand
into the address where the `rsp` pointed to. -
`Pop`: get the number inside `esp` and minus
`esp` with 4.

### calling convention of x86
system

1. push specific parameter into stack.
1. push the next instruction into stack.
1. jump to the function.

the second step and the third step execute with
`call`.

### the beginning of the
function of x86

- begin
  - `push ebp` ->push ebp into stack.
  - `mov ebp, esp`->make the botton of the stack be the
top of the stack
  - `sub esp, xxx`->create spaces for the stack.
- return
  - `pop XXX` : restore the stored register value.
  - `mov esp, ebp`: make the top of the stack the address
where it used to start.
  - `pop ebp`: get the stored ebp value.
  - `ret` : get the return address from the stack and return
to the main function.

## Reference

https://www.bookstack.cn/read/CTF-All-In-One/doc-1.4_web_basic.md
