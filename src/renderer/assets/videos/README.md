# Videos Directory

This directory contains background videos for the Levante onboarding wizard.

## Usage

### Wizard Background Video

Place your wizard background video here with the name:
```
wizard-background.mp4
```

**Important:** The video is imported as a Vite module in `WizardStep.tsx`:
```typescript
import wizardVideo from '@/assets/videos/wizard-background.mp4';
```

This allows Vite to properly bundle and serve the video file in both development and production builds.

### Supported Formats

- `.mp4` (recommended - best compatibility)
- `.webm` (good compression)
- `.mov` (works but larger file size)

### Video Recommendations

**Resolution:**
- Recommended: 1920x1080 (Full HD)
- Minimum: 1280x720 (HD)

**Aspect Ratio:**
- 16:9 (standard)

**File Size:**
- Keep under 10MB for smooth loading
- Use compression tools like HandBrake or FFmpeg

**Duration:**
- 10-30 seconds (will loop automatically)

**Content:**
- Abstract backgrounds
- Subtle animations
- Gradients or particles
- Avoid text or important details (will be overlaid with dark overlay)

### Example FFmpeg Compression

To compress a video for optimal web use:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset slow \
  -crf 28 \
  -vf scale=1920:1080 \
  -an \
  wizard-background.mp4
```

### Multiple Videos (Optional)

You can add different videos for different themes:

```
wizard-background.mp4          # Default
wizard-background-dark.mp4     # Dark theme
wizard-background-light.mp4    # Light theme
```

Then modify `WizardStep.tsx` to select based on theme.

## Free Video Resources

- [Pexels Videos](https://www.pexels.com/videos/)
- [Pixabay Videos](https://pixabay.com/videos/)
- [Coverr](https://coverr.co/)
- [Mixkit](https://mixkit.co/free-stock-video/)

## Current Implementation

The video is used in:
- `src/renderer/components/onboarding/WizardStep.tsx`

Features:
- Auto-play on load
- Loops continuously
- Muted (no sound)
- Dark overlay (50% opacity) for text readability
- Responsive (covers full screen)
- Object-fit: cover (maintains aspect ratio)
