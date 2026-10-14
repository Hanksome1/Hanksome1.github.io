---
# 從舊站（2023，Hexo + Fluid）搬過來的文章，permalink 保留舊網址
title: microprocessor
date: 2023-11-14 14:14:00
tags:
  - NTHU
permalink: 2023/11/14/microprocessor/
---

# Microprocessor

This class is an elective course in NTHU's electrical engineering program. I'm documenting the lab content as notes with the hope that it can assist others who are taking similar courses.

This course uses 8051, a Microprocessor developed by Microsoft back in 1980s. The following content is some introduction to 8051.

## Characteristics and Features of 8051

1. Architecture: The 8051 microcontroller uses a Harvard architecture, which means it has separate buses for program memory (ROM/Flash) and data memory (RAM). It is an 8-bit microcontroller, meaning it processes data in 8-bit chunks.
1. Memory: The 8051 typically includes 4 KB of on-chip ROM (program memory) and 128 bytes of on-chip RAM (data memory). Some variants may have more memory or additional features.
1. CPU: It has a single 8-bit CPU core with a wide range of addressing modes, making it suitable for a variety of tasks. It can execute most instructions in one to two machine cycles.
1. Peripherals: The 8051 microcontroller features a variety of on-chip peripherals, including timers/counters, serial communication ports (UART), I/O ports, and interrupt control. These peripherals can be used for tasks such as timing, communication, and general-purpose input and output.
1. Clock Speed: The 8051 typically operates at a clock speed of 12 MHz or less, although some variants can run at higher speeds.
1. Instruction Set: The 8051 instruction set is known for its simplicity and ease of use. It includes a wide range of instructions for data manipulation, logical operations, branching, and more.
1. Interrupt System: The 8051 features a flexible interrupt system, allowing it to respond to external events and prioritize interrupts as needed.
1. I/O Ports: It has four 8-bit I/O ports (P0, P1, P2, and P3), which can be configured as inputs or outputs. These ports are often used for interfacing with external devices.
1. Low Power Modes: Many 8051 microcontroller variants support low power modes to conserve energy when the device is idle.
