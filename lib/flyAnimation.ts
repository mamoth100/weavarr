/**
 * Creates a flying card animation from a source element to a target nav link.
 * The card poster shrinks and flies to the icon in the header.
 */
export function flyToTarget(
  sourceEl: HTMLElement,
  targetId: string,
  posterUrl: string | null
) {
  const target = document.getElementById(targetId);
  const card = sourceEl.closest('.group') as HTMLElement | null;
  const sourceRect = (card ?? sourceEl).getBoundingClientRect();
  const targetRect = target
    ? target.getBoundingClientRect()
    : { left: window.innerWidth - 32, top: 16, width: 16, height: 16 };

  const fly = document.createElement('div');
  fly.style.cssText = `
    position: fixed;
    left: ${sourceRect.left}px;
    top: ${sourceRect.top}px;
    width: ${sourceRect.width}px;
    height: ${sourceRect.height}px;
    border-radius: 8px;
    overflow: hidden;
    opacity: 0.85;
    pointer-events: none;
    z-index: 9999;
    transition: left 0.45s cubic-bezier(0.4,0,0.2,1),
                top 0.45s cubic-bezier(0.4,0,0.2,1),
                width 0.45s cubic-bezier(0.4,0,0.2,1),
                height 0.45s cubic-bezier(0.4,0,0.2,1),
                opacity 0.45s ease,
                border-radius 0.45s ease;
    ${posterUrl
      ? `background-image: url(${posterUrl}); background-size: cover; background-position: center;`
      : 'background: rgba(113,113,122,0.7);'}
  `;
  document.body.appendChild(fly);

  // Force reflow before transitioning
  void fly.getBoundingClientRect();

  const cx = targetRect.left + targetRect.width / 2;
  const cy = targetRect.top + targetRect.height / 2;
  fly.style.left = `${cx - 8}px`;
  fly.style.top = `${cy - 8}px`;
  fly.style.width = '16px';
  fly.style.height = '16px';
  fly.style.opacity = '0';
  fly.style.borderRadius = '50%';

  fly.addEventListener('transitionend', () => fly.remove(), { once: true });
}
