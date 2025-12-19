import { ref, onUnmounted, unref, type Ref } from 'vue';

interface TextNode {
  type: 'text';
  content: string;
  parentTags: string[];
}

interface HtmlNode {
  type: 'html';
  tag: string;
  isClosing: boolean;
}

type ParsedNode = TextNode | HtmlNode;

export interface TypingAnimationOptions {
  speed: Ref<number> | number; // 0 = instant, higher = slower
  onComplete?: () => void;
}

export function useTypingAnimation(options: TypingAnimationOptions) {
  const displayedText = ref('');
  const isAnimating = ref(false);

  let animationFrameId: number | null = null;
  let currentNodes: ParsedNode[] = [];
  let currentIndex = 0;
  let currentCharIndex = 0;
  let lastFrameTime = 0;
  let skipRequested = false;

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

        tagStack.push(openTag);
        nodes.push({
          type: 'html',
          tag: openTag,
          isClosing: false
        });

        // Process children
        for (let i = 0; i < node.childNodes.length; i++) {
          traverseNode(node.childNodes[i]);
        }

        // Store closing tag
        nodes.push({
          type: 'html',
          tag: `</${tagName}>`,
          isClosing: true
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
   * Build HTML string up to current position
   */
  function buildDisplayedHtml(): string {
    let html = '';
    const openTags: string[] = [];

    const maxIndex = Math.min(currentIndex, currentNodes.length - 1);

    for (let i = 0; i <= maxIndex; i++) {
      const node = currentNodes[i];

      if (!node) continue;

      if (node.type === 'html') {
        html += node.tag;
        if (!node.isClosing) {
          openTags.push(node.tag);
        } else {
          openTags.pop();
        }
      } else if (node.type === 'text') {
        // Add parent tags if this is the current node
        if (i === currentIndex) {
          const charsToShow = currentCharIndex;
          const textToShow = node.content.substring(0, charsToShow);
          html += textToShow;
        } else {
          html += node.content;
        }
      }
    }

    return html;
  }

  /**
   * Animation loop
   */
  function animate(timestamp: number) {
    if (!isAnimating.value) return;

    const speed = unref(options.speed);

    // If speed is 0 or skip requested, show everything instantly
    if (speed === 0 || skipRequested) {
      skipRequested = false;
      completeAnimation();
      return;
    }

    // Calculate delay per character based on speed
    // speed 20 = 50ms, speed 50 = 20ms, speed 100 = 10ms
    const delayMs = Math.max(10, 120 - speed);

    // Calculate characters to process per frame based on speed
    // For speeds > 120, process multiple characters at once
    const charsPerFrame = speed > 120 ? Math.ceil(speed / 120) : 1;

    if (timestamp - lastFrameTime < delayMs) {
      animationFrameId = requestAnimationFrame(animate);
      return;
    }

    lastFrameTime = timestamp;

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
        // HTML tags appear instantly
        currentIndex++;
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

    displayedText.value = buildDisplayedHtml();

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
    currentIndex = currentNodes.length - 1;

    // Build complete HTML
    let fullHtml = '';
    for (const node of currentNodes) {
      if (node.type === 'html') {
        fullHtml += node.tag;
      } else if (node.type === 'text') {
        fullHtml += node.content;
      }
    }

    displayedText.value = fullHtml;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    options.onComplete?.();
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
    displayedText.value = '';

    const speed = unref(options.speed);

    // If speed is 0, show instantly
    if (speed === 0) {
      displayedText.value = htmlContent;
      options.onComplete?.();
      return;
    }

    isAnimating.value = true;
    animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Skip to end of animation
   */
  function skipAnimation() {
    if (isAnimating.value) {
      skipRequested = true;
    }
  }

  /**
   * Reset animation state
   */
  function reset() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isAnimating.value = false;
    displayedText.value = '';
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
    displayedText,
    isAnimating,
    startAnimation,
    skipAnimation,
    reset
  };
}
