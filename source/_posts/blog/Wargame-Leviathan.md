---
# 從舊站（2023，Hexo + Fluid）搬過來的文章，permalink 保留舊網址
title: Wargame_Leviathan
date: 2023-09-22 23:35:00
tags:
  - Wargame
permalink: 2023/09/22/Wargame-Leviathan/
---

This is a write up of Leviathan. Leviathan is a wargame, mostly about
reverese engineering. There are seven level in this wargame. I collect
the key to every level at the end of this blog, please use it if you
want to get access of certain level.

## Leviathan0

first use string to detect some useful imformation, and we can find
out their is a password inside. Then we cansimply use grep to findout
the password.

```bash
$cat bookmark.htmp|grep password. 
```

## Leviathan1

- Their is a ececutable file inside. so i use radare2 to see the
outlook of the program. we can fond four
string"secret","god","sex","love" inside. inside and the and before the
function call strcmp function, the put "sex" into the register, so we
can know that this program check the input with "sex".
- Therefore, i simply input sex, and get the root of leviathan2, and
then cat the password file inside 'Leviathan_pass/Leviathan2'

## Leviathan2

this one is a hard question, this problem i look out other people's
write up, and they utilize the access function. when their is a file
with a space inside the filename, the access function will check the two
file seperately. >For example, if the filename is "hank heroine.txt",
then the access function >will check both hank and heroine inside the
file.

After using radare2 to check the function, we can see that the
function will printout the file using the shell of leviathan3.
Therefore, I make a file named `hank\ heroine.txt` and make a
link from heroine.txt to `/etc/leviathan_pass/leviathan3`

## Leviathan3

simply using `ltrace` to see how this file work. We can
find out that this program call a strcmp function, and compare the input
with a specific string "snlprintf". so we can get the shell of
leviathan4.

## Leviathan4

another simple problem, use `ltrace` we can find out this
program call the `fopen` function, so we can know that this
function is printing the content of the password. the only thing we need
to do is to tranfer the ASCII code into strings.

## Leviathan5

This program open the file at `/etc/file.log` but their is
no such file. What's more this program print out the file using the
shell of leviathan6. Similar to Leviathan2, I create a linkage between
`/etc/file.log` and
`/etc/leviathan_pass/leviathan6` , so it will print out the
content of leviathan6.

## Leviathan6

- First i use `ltrace` to find out what this program, and i
found that it calls the `atoi` function, which transfer a
string into an interger. So i think the correct code of this function is
inside this program.
- Therefore, i use radare2 to reassemble the program, and there is one
var that store a hex number`1bd3`, and the later compare code
also compare the input with this variable.
- So i use the Decimal number `7123` (0x1bd3) as the code
of this program. and get the shell of leviathan7.

## Leviathan7

![](https://hackmd.io/_uploads/B1Yg6sMKn.png)

## the password to every tlevel

| level | password |
| --- | :---: |
| leviathan1 | PPIfmI1qsA |
| leviathan2 | mEh5PNl10e |
| leviathan3 | Q0G8j4sakn |
| leviathan4 | AgvropI4OA |
| leviathan5 | EKKlTF1Xqs |
| leviathan6 | YZ55XPVk2l |
| leviahtan7 | 8GpZ5f8Hze |
