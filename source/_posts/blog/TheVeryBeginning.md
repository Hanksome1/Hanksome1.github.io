---
# 從舊站（2023，Hexo + Fluid）搬過來的文章，permalink 保留舊網址
title: TheVeryBeginning
date: 2023-01-15 18:31:00
tags:
  - Web
permalink: 2023/01/15/TheVeryBeginning/
---

# My first post

## 這個部落格

今天來建了這個靜態網站，用`hexo`架出來的，就是一直套用模板，目前正在努力改模板，希望能把自己的部落格做的漂亮一點。之後應該會把這個網站加上一些酷酷的東西，像是頭會動的貓貓還有酷酷的特效之類的。
關於這個網頁，然後這個部落格我用的 theme 是 **fluid**
模板，然後我目前遇到的技術上的困難是我更改`/public/img`的圖片之後網頁上傳github之後網站會的圖片跟文章會更新，但是它的色彩卻沒有更新；相對地當我想要用local
host先預覽的時候我卻發現他的圖片並沒有變動，但是顏色有更動。
>因為今天要測試網站下拉的樣式，所以上面放了兩篇高中時候的東西，也算是高中記錄。
## 來由
關於為何要件這個網站呢，簡單記錄一些有趣的活動、大學修課的心得，一些自己學習的心路歷程，或是分享一些筆記之類的(大一上有用notion做一些筆記，看之後能不能傳上來)。加上之前看到兩個資工電神在架，感覺非常有趣，想說恰巧放寒假就來架一下。

## 今日份的筆記

- 以下是hexo之後會常常用到的指令
  ```bash
  hexo n "xxx" = hexo new "xxx" # 新增名為 xxx 的文章
  hexo g = hexo generate # 生成靜態網站
  hexo s = hexo sever # 啟動本地預覽
  hexo d = hexo deploy # 部屬網站
  hexo clean # 清除緩存 ，一般不會用到
  ```
- 一個今天遇到的技術上的問題
  ```markdown
  . : 因為這個系統上已停用指令碼執行，所以無法載入 C:UsersUSERNAMEDocumentsWindows
  PowerShellprofile.ps1 檔案。如需詳細資訊，請參閱 about_Execution_Policies，網址為
  https:/go.microsoft.com/fwlink/?LinkID=135170。
  位於 線路:1 字元:3
  + . 'C:UsersUSERNAMEDocumentsWindowsPowerShellprofile.ps1'
  +   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      + CategoryInfo          : SecurityError: (:) [], PSSecurityException
      + FullyQualifiedErrorId : UnauthorizedAccess
  ```
  後來用administrator的身分開啟shell，然後打下面的指令就解決了，雖然我也不是很確定為甚麼可以這樣解決，但是我卡在這個地方快一個小時，所以還是紀錄一下。
  ```gams
  Set-ExecutionPolicy RemoteSigned
  ```
  後記:後來發現為何generate的顏色跟local
  host會不同，因為有一些暫存放在裡面沒有被更新，所以要先用
  `hexo clean`
  把暫存都先清掉，然後在將整個網站generate之後deploy上去。
