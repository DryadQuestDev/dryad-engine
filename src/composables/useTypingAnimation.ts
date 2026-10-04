import { ref, onUnmounted, unref, type Ref } from 'vue';

interface TextNode {
  type: 'text';
  content: string;
  parentTags: string[];
}

/** Pacing markers emitted by logicSystem.resolveTextTags (`<span class='text-tag' data-tag=…>`). */
type TextTagKind = 'w' | 'nw' | 'fast' | 'cps';

interface HtmlNode {
  type: 'html';
  tag: string;
  isClosing: boolean;
  textTag?: TextTagKind;
  value?: string;
}

type ParsedNode = TextNode | HtmlNode;

export interface TypingAnimationOptions {
  speed: Ref<number> | number; // 0 = instant, higher = slower
  onComplete?: () => void;
  /** The text carried a `[nw]` tag: the caller should advance on its own after `delaySeconds`. */
  onNoWait?: (delaySeconds: number) => void;
}

const TEXT_TAG_KINDS: TextTagKind[] = ['w', 'nw', 'fast', 'cps'];

export function useTypingAnimation(options: TypingAnimationOptions) {
  /**
   * How many characters of the text (counted over its text nodes in document order) are revealed.
   * Infinity = all. The consumer applies this to a DOM it rendered once, instead of re-rendering an
   * HTML prefix on every frame — which recreated every element and restarted its CSS animations.
   */
  const revealedChars = ref(Infinity);
  const isAnimating = ref(false);
  /** Parked on a `[w]` click-wait. isAnimating stays true; resume() (or skipAnimation()) continues. */
  const isWaiting = ref(false);

  let animationFrameId: number | null = null;
  let currentNodes: ParsedNode[] = [];
  let currentIndex = 0;
  let currentCharIndex = 0;
  let lastFrameTime = 0;
  let skipRequested = false;
  /** Timed `[w=N]` in progress: the timestamp at which typing resumes. */
  let pauseUntil: number | null = null;
  /** Index of the last `[fast]` marker: everything before it appears at once. */
  let fastIndex = -1;
  /** Open `[cps]` overrides, innermost last. Each is a per-character delay in ms. */
  let cpsStack: number[] = [];
  /** Set by `[nw]` — handed to onNoWait when the text completes. */
  let noWaitDelay: number | null = null;

  /**
   * Parse HTML string into nodes while preserving structure
   */
  function parseHtml(html: string): ParsedNode[] {
    const nodes: ParsedNode[] = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const tagStack: string[] = [];

    function traverseNode(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.length > 0) {
          nodes.push({
            type: 'text',
            content: text,
            parentTags: [...tagStack]
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        // Store opening tag with attributes
        let openTag = `<${tagName}`;
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          openTag += ` ${attr.name}="${attr.value}"`;
        }
        openTag += '>';

        const dataTag = element.classList.contains('text-tag') ? element.getAttribute('data-tag') : null;
        const textTag = TEXT_TAG_KINDS.includes(dataTag as TextTagKind) ? (dataTag as TextTagKind) : undefined;
        const value = element.getAttribute('data-value') ?? undefined;

        tagStack.push(openTag);
        nodes.push({
          type: 'html',
          tag: openTag,
          isClosing: false,
          textTag,
          value
        });

        // Process children
        for (let i = 0; i < node.childNodes.length; i++) {
          traverseNode(node.childNodes[i]);
        }

        // Store closing tag
        nodes.push({
          type: 'html',
          tag: `</${tagName}>`,
          isClosing: true,
          textTag
        });
        tagStack.pop();
      }
    }

    for (let i = 0; i < tempDiv.childNodes.length; i++) {
      traverseNode(tempDiv.childNodes[i]);
    }

    return nodes;
  }

  /**
   * Characters revealed so far: every text node before the cursor in full, plus the cursor's part.
   */
  function countRevealed(): number {
    let count = 0;
    for (let i = 0; i < currentIndex && i < currentNodes.length; i++) {
      const node = currentNodes[i];
      if (node.type === 'text') count += node.content.length;
    }
    const cursor = currentNodes[currentIndex];
    if (cursor && cursor.type === 'text') count += Math.min(currentCharIndex, cursor.content.length);
    return count;
  }

  /**
   * Per-character delay for the base speed setting.
   * speed 20 = 100ms, speed 50 = 70ms, speed 120 = 10ms
   */
  function baseDelayMs(speed: number): number {
    return Math.max(10, 120 - speed);
  }

  /**
   * A `[cps=…]` value → per-character delay. `30` is 30 characters per second; `*2` is twice the
   * current rate (base speed or the enclosing [cps]).
   */
  function cpsToDelay(value: string, enclosingDelay: number): number {
    if (value.startsWith('*')) {
      const factor = parseFloat(value.slice(1));
      return factor > 0 ? enclosingDelay / factor : enclosingDelay;
    }
    const cps = parseFloat(value);
    return cps > 0 ? 1000 / cps : enclosingDelay;
  }

  function currentDelayMs(speed: number): number {
    return cpsStack.length ? cpsStack[cpsStack.length - 1] : baseDelayMs(speed);
  }

  /**
   * Animation loop
   */
  function animate(timestamp: number) {
    if (!isAnimating.value || isWaiting.value) return;

    const speed = unref(options.speed);

    // A timed [w=N] holds the loop here; a skip cuts it short.
    if (pauseUntil !== null) {
      if (timestamp < pauseUntil && !skipRequested) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }
      pauseUntil = null;
      lastFrameTime = 0;
    }

    // Speed 0 (the "none" setting) and a skip reveal everything up to the next click-wait
    // at once; so does the stretch before a [fast] marker.
    const instant = speed === 0 || skipRequested || currentIndex < fastIndex;

    const delayMs = currentDelayMs(speed);

    if (!instant && timestamp - lastFrameTime < delayMs) {
      animationFrameId = requestAnimationFrame(animate);
      return;
    }

    lastFrameTime = timestamp;

    // Characters per frame: one, unless the delay is shorter than a frame. The base speed keeps
    // its original ramp (speed > 120 → several per frame); a [cps] override derives it from the delay.
    let charsPerFrame = 1;
    if (instant) {
      charsPerFrame = Infinity;
    } else if (cpsStack.length) {
      charsPerFrame = delayMs < 16 ? Math.ceil(16 / delayMs) : 1;
    } else if (speed > 120) {
      charsPerFrame = Math.ceil(speed / 120);
    }

    // Process multiple characters per frame for high speeds
    for (let c = 0; c < charsPerFrame; c++) {
      // Find next character to display
      if (currentIndex >= currentNodes.length) {
        completeAnimation();
        return;
      }

      const node = currentNodes[currentIndex];

      if (!node) {
        completeAnimation();
        return;
      }

      if (node.type === 'html') {
        // HTML tags appear instantly; pacing markers steer the loop.
        currentIndex++;

        if (node.textTag === 'w' && !node.isClosing) {
          if (node.value !== undefined) {
            // Timed wait. A skip runs straight through it.
            if (!skipRequested) {
              pauseUntil = timestamp + parseFloat(node.value) * 1000;
              revealedChars.value = countRevealed();
              animationFrameId = requestAnimationFrame(animate);
              return;
            }
          } else {
            // Click wait. A skip stops here too — the next click continues from this spot.
            skipRequested = false;
            isWaiting.value = true;
            revealedChars.value = countRevealed();
            return;
          }
        } else if (node.textTag === 'cps') {
          if (node.isClosing) {
            cpsStack.pop();
          } else {
            cpsStack.push(cpsToDelay(node.value ?? '', currentDelayMs(speed)));
          }
          // The rate changed: let the next frame pick up the new delay.
          if (!instant) break;
        } else if (node.textTag === 'nw' && !node.isClosing) {
          noWaitDelay = node.value !== undefined ? parseFloat(node.value) : 0;
        }
        // Continue to next iteration to process more
      } else if (node.type === 'text') {
        currentCharIndex++;

        // Skip whitespace characters instantly
        while (currentCharIndex <= node.content.length) {
          const nextChar = node.content[currentCharIndex];

          // If current char is not whitespace, break
          // If we've shown all content, break
          if (!nextChar || !/\s/.test(nextChar)) {
            break;
          }

          // Skip whitespace
          currentCharIndex++;
        }

        if (currentCharIndex > node.content.length) {
          // Move to next node
          currentIndex++;
          currentCharIndex = 0;
        }
      }
    }

    revealedChars.value = countRevealed();

    if (currentIndex < currentNodes.length) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      completeAnimation();
    }
  }

  /**
   * Complete animation and show full text
   */
  function completeAnimation() {
    isAnimating.value = false;
    isWaiting.value = false;
    skipRequested = false;
    pauseUntil = null;
    currentIndex = currentNodes.length - 1;
    revealedChars.value = Infinity;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    options.onComplete?.();

    if (noWaitDelay !== null) {
      const delay = noWaitDelay;
      noWaitDelay = null;
      options.onNoWait?.(delay);
    }
  }

  /**
   * Start typing animation
   */
  function startAnimation(htmlContent: string) {
    // Cancel any ongoing animation
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }

    // Reset state
    currentNodes = parseHtml(htmlContent);
    currentIndex = 0;
    currentCharIndex = 0;
    lastFrameTime = 0;
    skipRequested = false;
    pauseUntil = null;
    cpsStack = [];
    noWaitDelay = null;
    isWaiting.value = false;
    revealedChars.value = 0;

    fastIndex = -1;
    let hasTextTags = false;
    currentNodes.forEach((node, i) => {
      if (node.type !== 'html' || !node.textTag) return;
      hasTextTags = true;
      if (node.textTag === 'fast' && !node.isClosing) fastIndex = i;
    });

    const speed = unref(options.speed);

    // If speed is 0 and nothing paces the text, show instantly. With pacing tags the loop still
    // runs: the text lands at once but [w] and [nw] keep their meaning.
    if (speed === 0 && !hasTextTags) {
      revealedChars.value = Infinity;
      options.onComplete?.();
      return;
    }

    isAnimating.value = true;
    animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Continue after a `[w]` click-wait.
   */
  function resume() {
    if (!isWaiting.value) return;
    isWaiting.value = false;
    lastFrameTime = 0;
    animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Reveal the text up to the next `[w]` click-wait (or the end). Parked on a click-wait, it
   * continues instead — one click means "go on" in both states.
   */
  function skipAnimation() {
    if (isWaiting.value) {
      resume();
    } else if (isAnimating.value) {
      skipRequested = true;
    }
  }

  /**
   * Reset animation state — the text, if any, shows in full.
   */
  function reset() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isAnimating.value = false;
    isWaiting.value = false;
    skipRequested = false;
    pauseUntil = null;
    cpsStack = [];
    noWaitDelay = null;
    revealedChars.value = Infinity;
    currentNodes = [];
    currentIndex = 0;
    currentCharIndex = 0;
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  });

  return {
    revealedChars,
    isAnimating,
    isWaiting,
    startAnimation,
    skipAnimation,
    resume,
    reset
  };
}
