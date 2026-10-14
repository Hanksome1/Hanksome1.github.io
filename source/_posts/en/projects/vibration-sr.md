---
title: Handheld Multi-Frame Super-Resolution with a Vibration Motor
date: 2026-10-14 09:00:00
layout: project
featured: false
part: VIB-SR
summary: An Android app that drives the phone's vibration motor (or an external motor) during a burst to create sub-pixel shifts, plus two multi-frame super-resolution methods, kernel regression and TV optimization. The IMU confirms the motor injects about 5× more motion, but motion blur within each exposure leaves the reconstructions worse than with natural hand tremor.
period: 2026 Spring
role: Capture app · Alignment · SR reconstruction
course: Final project, EE6620 Computational Photography, NTHU
team: 2-person team
stack: [Python, Flutter, Kotlin]
tools: [NumPy, SciPy, ProxImaL, OpenCV, Android Camera2]
tags: [Computational Photography, Super-Resolution, Android, Python]
floorplan: [CAPTURE APP, IMU LOG, ALIGN, KERNEL MERGE, TV SOLVER]
metrics:
  - { label: Kernel merge, value: 6.4 s, note: "TV solver: 2328.9 s" }
  - { label: Upscale, value: "2× · 4× · 5×", note: kernel-regression merge }
  - { label: Injected motion, value: "≈ 5×", note: "IMU path length 4.1 → 20.7 mm (lowFreq)" }
  - { label: Burst, value: 8–32 frames, note: "manual exposure · AE / AF / AWB off" }
---

## Overview

The resolution of a single phone photo is limited by the sensor: the lens can often resolve detail finer than a pixel, and that detail falls between pixels and folds back as aliasing. A single shot can't recover it, but a **burst** can: as long as the camera moves by less than a pixel between frames, each frame samples the scene at a slightly different position, and merging these interleaved samples onto a finer grid reconstructs high-frequency detail that no single photo captures.

Wronski et al.'s *Handheld Multi-Frame Super-Resolution* (SIGGRAPH 2019, the method behind Super Res Zoom on Google Pixel) observed that **natural hand tremor** during capture already provides this kind of sub-pixel shift. But hand tremor can't be controlled: it may be too small (frames that are nearly identical), unevenly distributed, or mixed with too much drift.

Our idea was to **make the inter-frame shift a controllable part of the capture process**. We compared three ways of creating shifts — natural hand tremor, driving the phone's built-in vibration motor, and an external motor — and used the phone's IMU to verify how much motion was actually injected.

The answer turned out to be the opposite of what we expected: the motor did inject more motion, with a better sub-pixel distribution, but the reconstructions were **no sharper than with hand tremor**. The reason is that the motor blurred the image within the exposure time.

## System architecture

The system has three stages, and the last two deliberately keep two parallel reconstruction paths for comparison:

| Stage | What it does | Implementation |
| --- | --- | --- |
| Shifted burst | Handheld / phone vibration / external motor; a burst of 8–32 JPEGs with the IMU recorded alongside | Custom Android app |
| Alignment | Estimate each frame's shift relative to the reference frame | Coarse-to-fine alignment (shared by both paths) |
| Merge | Reconstruct a high-resolution image from the aligned frames | Kernel regression **or** TV optimization |

All super-resolution processing runs offline on a computer; the app only collects the data.

### Capture app

The phone's built-in camera API supports neither bursts nor manual exposure, so we wrote an app in Flutter, with the native parts in Kotlin. The app has three features that work together:

- **Vibration control**: through Flutter's vibration package and Android's `VibrationEffect`, each mode is an on–off pulse waveform of interleaved (timings, amplitudes); the pulse period sets the effective frequency, and the pattern loops for the whole burst:

  | Mode | Drive |
  | --- | --- |
  | `none` | no drive |
  | `lowFreq` | ≈ 10 Hz |
  | `midFreq` | ≈ 25 Hz |
  | `highFreq` | ≈ 50 Hz |
  | `lowAmp` | 25 Hz at reduced amplitude (to separate the effects of amplitude and frequency) |
  | `sweep` | frequency sweep |

- **Burst capture**: a native Camera2 plugin performs fully manual still-capture bursts, with auto-exposure, autofocus, and auto white balance turned off and a fixed ISO and short exposure.
- **IMU logging**: the accelerometer and gyroscope are subscribed to throughout the burst and saved together with the photos and capture parameters.

The IMU data is used to compute the amount of motion, its spectrum, and a filtered dead-reckoning trajectory (1.5 Hz high-pass, then detrended). Integrating acceleration twice always drifts, so the trajectories are used only to **compare** capture methods against each other, never as absolute displacements.

![IMU trajectory for one lowFreq burst: the top row shows position on three axes, the bottom row the 2D projections; over the roughly 1-second burst, the displacement stays around 1 mm](/images/vibration-sr/imu-trace.png)

### Alignment

Both paths use the same alignment engine and differ only in the form of its output: kernel regression needs a per-pixel displacement field, while TV optimization needs just one sub-pixel translation $(dx, dy)$ per tile per frame.

- **Coarse-to-fine block matching**: block matching on a Gaussian pyramid, using L2 at the coarse levels and L1 at the fine levels, with a quadratic surface fit over a 3×3 neighborhood for sub-pixel precision.
- **Lucas–Kanade refinement**: further refinement with dense optical flow.
- **Outlier rejection**: flat or periodic regions are easily mismatched, so two rounds of median filtering remove them.
- **Per-pixel displacement field**: each tile's displacement field is upsampled bilinearly into a per-pixel warp, so the merge shows no tile seams.

## Two merge methods

### Kernel regression

This is Wronski et al.'s method: on the upscaled grid, take a weighted average of the samples from all frames. $n$ indexes the frame, $i$ the samples near this output pixel, $c_{n,i}$ is a sample's color, and $d_i$ is its distance to the output pixel:

$$
C(x, y) = \frac{\sum_n \sum_i c_{n,i}\, w_{n,i}}{\sum_n \sum_i w_{n,i}},
\qquad
w_{n,i} = \exp\left(-\tfrac{1}{2}\, d_i^\top \Omega^{-1} d_i\right)
$$

$\Omega^{-1}$ comes from the structure tensor of the reference frame's luminance: on edges, the kernel stretches along the edge direction to keep the edge sharp; in flat regions it spreads out and denoises along the way. Samples are taken bilinearly at their back-projected continuous positions, the three RGB channels share a single kernel computed from luminance, and a robustness mask lowers the weight of misaligned regions and regions with moving objects.

This method is fast and robust, but it is fundamentally an order-0 smoother: at best it approaches "the true image blurred by the camera PSF".

### TV optimization

The second method treats super-resolution as an inverse problem: each low-resolution image $Y_i$ is the high-resolution image $X$ blurred by $B_i$ (a Gaussian PSF plus this frame's shift), downsampled by $D$, with noise added: $Y_i = D B_i X + n$. We look for the $X$ that minimizes the sum of its per-frame L1 errors and its total variation:

$$
E(X) = \sum_i \left\lVert D\,(X \otimes B_i) - Y_i \right\rVert_1 + \lambda \left\lVert \nabla X \right\rVert_{TV},
\qquad
\left\lVert \nabla X \right\rVert_{TV} = \sum_p \sqrt{X_x(p)^2 + X_y(p)^2}
$$

Unlike kernel regression, this method **deconvolves the PSF**, so it can recover more detail than a smoother; the L1 distance and the edge-preserving TV term also make it less sensitive to outliers. The price is that it has to be solved iteratively, and it depends heavily on how accurate the forward model is. We solve it with the open-source [ProxImaL](https://github.com/comp-imaging/ProxImaL), running a fixed number of iterations.

Two problems had to be handled in the implementation:

**Splitting shifts into integer and fractional parts.** The sub-pixel forward model only holds while the center of the blur kernel stays inside its small window. But vibration-induced shifts are often several pixels; if the whole shift is folded into the kernel, its center leaves the 15×15 window and the deconvolution breaks. So each frame's shift is split into an integer and a fractional part:

$$
dx = \operatorname{round}(dx) + \operatorname{frac}(dx)
$$

The integer part directly moves the position where this frame's tile is read, to $(o_x + \operatorname{round}(dx),\ o_y + \operatorname{round}(dy))$; only the fractional part goes into the PSF, as the sub-pixel kernel center. Matching the library's downsampling convention, the shifted kernel center is ($s$ is the upscaling factor; $dx, dy$ are the fractional parts of the shift):

$$
\text{center} = \left(-\frac{s - 1}{2} + s \cdot dx,\ -\frac{s - 1}{2} + s \cdot dy\right)
$$

**Reconstructing large regions with overlapping sub-tiles.** A single TV solve assumes one translation per frame for the whole tile. That is fine for a small 256×256 tile, but across a large image the shift varies with position and even includes rotation. So the 512×512 low-resolution region is cut into 256×256 sub-tiles at stride 128 — a 3×3 grid, 9 solves in total — each producing a 512×512 high-resolution patch, and the overlaps are blended with a Hann-window weighted average:

$$
\text{merge} = \frac{\sum_t w_t \cdot \text{patch}_t}{\sum_t w_t},
\qquad
w_t = 0.5 \cdot \left(1 - \cos\frac{t\pi}{\text{tile}/2}\right)
$$

![Left: the reconstruction of each of the 9 sub-tiles; right: the 1024×1024 image after Hann-window blending](/images/vibration-sr/tiled-merge.png)

### Assumptions

1. The scene is roughly static over the ~1-second burst.
2. Inter-frame shifts are small and come mainly from global camera motion, so a global warp plus tile alignment with median filtering is reasonable.
3. Chroma follows luminance, so RGB can share one kernel.
4. The blur assumed by the TV solve matches the real PSF, so the deconvolution is well-posed.

## Experiments

| Experiment | Variable | Conclusion |
| --- | --- | --- |
| A | Two merge methods × two scenes | TV gives the sharpest edges but is noise-sensitive and about 360× slower; kernel regression is clean and fast |
| B | Number of input frames $N$ and upscaling factor | Detail increases monotonically with $N$, with diminishing returns |
| C | Phone vibration mode (tripod, same scene) | The motor injects several times more motion, but the reconstructions get no sharper |
| D | Where the external motor is attached on the body | Moderate motion helps; too much blurs and exceeds the alignment range |
| E | Vibration modes on a tripod at an outdoor building, with shift analysis | The sub-pixel distribution improves, but image quality still doesn't |

Experiment B only changes how many frames of the same burst are used, so the spectra can be compared directly; experiments C–E compare different bursts (some even of different scenes) that don't line up at the pixel level, so they are compared only through detail crops and IMU-measured motion.

### A. Kernel regression vs. TV optimization

Two scenes: (1) bright, high-contrast roof tiles, and (2) a low-contrast brick wall in shadow. Each is compared against nearest-neighbor ×2 and bicubic ×2 (the baselines). The TV settings are a single 256×256 tile, $\lambda = 5 \times 10^{-3}$, 200 iterations, and a Gaussian $\sigma = 1.2$.

![Experiment A, roof-tile scene. From left: nearest-neighbor ×2, bicubic ×2, TV optimization, kernel regression; the bottom row shows 4× crops](/images/vibration-sr/exp-a-roof.png)

![Experiment A, brick wall in shadow. TV optimization shows clear ringing noise in the dark regions](/images/vibration-sr/exp-a-brick.png)

Both methods are sharper than bicubic; they differ in three respects:

- **Edge sharpness**: in both scenes the ranking is TV > kernel regression > bicubic. TV inverts the PSF, with help from the TV term, rather than just averaging blurred samples; kernel regression is cleaner than bicubic, but its edges are slightly soft.
- **Denoising**: kernel regression does better, especially in the poorly lit scene. It behaves like a low-pass filter, removing high-frequency noise along the way; TV can't remove noise and may even add some through ringing. In the spectrum, TV has the most high-frequency energy, but that includes both edges and noise.
- **Run time**: TV takes 2328.9 s, kernel regression only 6.4 s. TV has to keep iterating on its objective, and it also needs more memory.

### B. Number of input frames

Using a single 32-frame handheld burst (a static building facade), we drop the first 3 frames and run kernel regression at 2×, 4×, and 5× for $N = 2$ to 29 frames. Since only $N$ changes, the power ratio between the SR result and bicubic in the band just above the input Nyquist frequency can serve as the metric.

![Experiment B: left, the band near the SR Nyquist, which is noise-dominated and not comparable across factors; right, the clean band just above the input Nyquist, where every factor rises with N](/images/vibration-sr/exp-b-frames.png)

In the clean band, detail rises monotonically with $N$ at every factor, from about 0.50× bicubic at $N = 2$ to about 0.72× at $N = 29$, with diminishing returns; the denser 4× and 5× grids need more frames to fill. This is the only experiment whose numbers can be compared directly, and it confirms that multi-frame merging really does recover detail. The left plot is a reminder that a single high-frequency number is easily misled by noise.

![Experiment B brick-wall detail: bicubic, N = 8, N = 29](/images/vibration-sr/exp-b-brick.png)

### C. Phone vibration modes

To separate the motor from hand motion, we fixed the phone on a tripod and shot the same scene as a 32-frame burst with each of `none`, `lowFreq`, and `midFreq`. Pressing the shutter itself shakes the phone, so we reconstructed from frames 16–32 only, and recorded the IMU throughout.

The IMU confirms the motor did what we wanted: the filtered trajectory length grew from about 4.1 mm for `none` to about 20.7 mm for `lowFreq` and about 12.3 mm for `midFreq`, several times the residual motion on the tripod.

The reconstructions tell a completely different story: none of the vibrated versions got sharper, and the best result came from handheld capture with natural hand motion alone. An earlier handheld round with six vibration modes showed the same thing:

![Detail comparison across six vibration modes in handheld capture. None of the vibrated versions is sharper than none](/images/vibration-sr/exp-c-modes.png)

There are two reasons. First, **the vibrated input frames are blurry to begin with**:

![Upscaled low-resolution input of the same scene: with hand tremor only, the mortar lines are crisp; with phone vibration, they are clearly blurred](/images/vibration-sr/blur-compare.png)

Second, **hand tremor during handheld capture already provides enough sub-pixel shift**. Plotting the fractional part of each frame's shift in the unit cell, `none` actually has the highest coverage:

![Sub-pixel shift distribution for each vibration mode in handheld capture; higher coverage means the unit cell is filled more evenly. none is highest at 0.839, lowAmp lowest at 0.638](/images/vibration-sr/exp-c-coverage.png)

So for handheld capture, adding phone vibration does not increase resolution.

### D. Where the external motor is attached

Holding the phone by hand, we attached the external motor to different places on the body — the right hand, the back, the left arm, the left hand, and the left arm at the highest frequency — and shot one burst per position with the IMU recorded.

The attachment point had a large effect on the amount of motion: the filtered trajectory length ranged from about 5 mm on the right hand to about 33 mm on the left hand (with a peak frequency of about 28 Hz). Most positions reconstructed sharper than bicubic, and the right hand gave the best result; but the left hand, with the largest and fastest motion, started blurring within a single frame and its shifts exceeded the aligner's range, so merge quality dropped. This marks the upper limit of the "usable motion range".

![Experiment D: detail comparison with the external motor attached at different positions. Far left is bicubic](/images/vibration-sr/exp-d-external.jpg)

### E. Phone vibration on a tripod

If hand tremor is already enough, can the motor fill in when there is **no hand tremor**? With the phone fixed on a tripod, we shot an outdoor building with `none`, `lowFreq`, and `midFreq`.

The shift analysis matched expectations. On the tripod, the residual camera motion is tiny, and the pixel-level shifts collapse into a small cluster near the origin (top row below; blue is tripod, gray is the earlier handheld data); with vibration on, the sub-pixel shifts spread out again. In other words, the motor did succeed in injecting the evenly distributed sub-pixel shifts that multi-frame SR needs in theory.

![Top: total pixel-level shift; bottom: sub-pixel phase distribution. Gray is handheld, blue is tripod](/images/vibration-sr/exp-e-offsets.png)

But image quality still didn't follow: the sub-pixel distribution is better, yet the reconstruction is no sharper — `none` looks best, while `lowFreq` and `midFreq` are both softer.

![Experiment E: detail comparison across vibration modes on a tripod](/images/vibration-sr/exp-e-tripod.png)

The problem lies in the input: the motor moves the phone so fast that it travels a noticeable distance **during each exposure**, turning the intended shift "between frames" into motion blur "within a frame". SR can merge sharp images that are offset from each other, but it can't conjure detail out of blurry ones.

## Conclusions

1. Both methods successfully reconstruct high-resolution images, and they complement each other: TV optimization gives the sharpest edges but is noise-sensitive, prone to artifacts, and much slower; kernel regression is fast, robust, and artifact-free, but softer. Detail also does increase monotonically with the number of frames.
2. Contrary to our initial hypothesis: the IMU confirms the motor injects several times more motion with a better sub-pixel distribution, yet the vibrated reconstructions are softer, and natural hand tremor (or no drive at all) works best.

{% note tip It all comes down to exposure time %}
The motor's motion has to be slow enough not to cause blur during the exposure, or the exposure has to be shorter. Active vibration still has value: it turns random hand tremor into **controllable** motion, which pays off as long as the drive is matched to the exposure time. The next step is to use the IMU to discard blurry frames and to shape the motor's motion around the exposure time and the needs of the merge kernel.
{% endnote %}

## What we built vs. reused

- **Referenced and reused**: we implemented Wronski et al.'s algorithm ourselves from the paper; the TV optimization started from the TA's code for the course's HW3 and was improved from there, with the open-source ProxImaL as the solver; the Python code on both paths uses only standard open-source libraries; the phone side uses Android's Camera2. The visualization scripts for the analysis results (matplotlib, etc.) were written with help from Claude.
- **Our own work**: all the experimental data, the Android app, the alignment, both merge methods, the integer/fractional split of the shifts, and the large-region reconstruction with overlapping sub-tiles.

## What I learned

- **SR needs shift between frames, not more shift.** The motion went up 5× and the sub-pixel distribution improved, yet image quality got worse; the real limit is motion during the exposure.
- **Measure first, then localize the problem.** With IMU trajectories and sub-pixel coverage, we could confirm that the motor worked and the alignment was fine, pinning the cause on motion blur in the input instead of suspecting the merge algorithm.
- **Sharp is not the same as good.** TV optimization has the most high-frequency content, but much of it is noise and ringing; a single high-frequency metric is easy to be fooled by, as the two bands in Experiment B show.

## References

1. B. Wronski, I. Garcia-Dorado, M. Ernst, D. Kelly, M. Krainin, C.-K. Liang, M. Levoy, and P. Milanfar, "Handheld Multi-Frame Super-Resolution," *ACM Transactions on Graphics*, vol. 38, no. 4, Art. no. 28, 2019.
2. G. Litterio, J.-D. Lizarazo-Ferro, P. Felzenszwalb, and R. Zia, "Super-Resolution with Structured Motion," *IEEE International Conference on Computational Photography (ICCP)*, 2025.
