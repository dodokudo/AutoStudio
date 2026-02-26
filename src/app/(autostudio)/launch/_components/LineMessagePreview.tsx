'use client';

import { memo } from 'react';
import type { LineMessage, FlexBlock, FlexButton, CarouselColumn } from '@/types/launch';

// LINE authentic colors
const LINE_BG = '#8AABCC';
const LINE_BUBBLE_BG = '#FFFFFF';
const LINE_GREEN = '#06C755';
const LINE_LINK_COLOR = '#5B7FFF';

const PREVIEW_WIDTH = 280;
const PADDING = 10;
const CONTENT_WIDTH = PREVIEW_WIDTH - PADDING * 2;

// Default account icon (gray circle + silhouette)
const DEFAULT_ACCOUNT_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#4A4A4A"/><circle cx="20" cy="16" r="7" fill="#FFF"/><ellipse cx="20" cy="34" rx="12" ry="10" fill="#FFF"/></svg>')}`;

interface LineMessagePreviewProps {
  messages: LineMessage[];
  notificationText?: string;
}

export const LineMessagePreview = memo(function LineMessagePreview({
  messages,
  notificationText,
}: LineMessagePreviewProps) {
  if (!messages || messages.length === 0) return null;

  return (
    <div
      style={{
        width: PREVIEW_WIDTH,
        backgroundColor: LINE_BG,
        borderRadius: 8,
        padding: PADDING,
        flexShrink: 0,
      }}
    >
      {/* Notification text */}
      {notificationText && (
        <div
          style={{
            marginBottom: 8,
            padding: '5px 8px',
            backgroundColor: 'rgba(0,0,0,0.15)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.6)',
              whiteSpace: 'nowrap',
              lineHeight: 1.5,
            }}
          >
            通知:
          </span>
          <span
            style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.85)',
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}
          >
            {notificationText}
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  );
});

// Type labels for card messages
const TYPE_LABELS: Partial<Record<LineMessage['type'], { label: string; color: string }>> = {
  carousel: { label: 'カルーセル', color: '#3B82F6' },
  flex: { label: 'フレックス', color: '#8B5CF6' },
};

const AccountIcon = memo(function AccountIcon() {
  return (
    <img
      src={DEFAULT_ACCOUNT_ICON}
      alt=""
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  );
});

const MessageItem = memo(function MessageItem({ message }: { message: LineMessage }) {
  const labelInfo = TYPE_LABELS[message.type];

  const content = (() => {
    switch (message.type) {
      case 'text':
        return <TextBubble text={message.text || ''} />;
      case 'image':
        return <ImageMessage imageUrl={message.imageUrl || ''} />;
      case 'carousel':
        return <CarouselMessage columns={message.columns || []} />;
      case 'flex':
        return <FlexMessage message={message} />;
      case 'richmenu':
        return <RichMenuIndicator text={message.text || 'リッチメニュー切替'} />;
      default:
        return null;
    }
  })();

  if (!labelInfo) return content;

  return (
    <div>
      <span
        style={{
          display: 'inline-block',
          fontSize: 9,
          fontWeight: 700,
          color: 'white',
          backgroundColor: labelInfo.color,
          borderRadius: 4,
          padding: '1px 5px',
          marginBottom: 3,
          letterSpacing: '0.02em',
        }}
      >
        {labelInfo.label}
      </span>
      {content}
    </div>
  );
});

// Text bubble (white background, account icon)
const TextBubble = memo(function TextBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
      <AccountIcon />
      <div
        style={{
          backgroundColor: LINE_BUBBLE_BG,
          color: '#111',
          maxWidth: `calc(100% - 32px)`,
          fontSize: 12,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          padding: '7px 10px',
          borderRadius: '14px 14px 14px 4px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
      >
        {text}
      </div>
    </div>
  );
});

// Image message
const ImageMessage = memo(function ImageMessage({ imageUrl }: { imageUrl: string }) {
  if (!imageUrl) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <img
        src={imageUrl}
        alt=""
        style={{
          maxWidth: CONTENT_WIDTH * 0.7,
          maxHeight: 180,
          borderRadius: 10,
          objectFit: 'cover',
          display: 'block',
        }}
        loading="lazy"
      />
    </div>
  );
});

// Carousel - show first card with count indicator
const CarouselMessage = memo(function CarouselMessage({
  columns,
}: {
  columns: CarouselColumn[];
}) {
  if (!columns || columns.length === 0) return null;
  const first = columns[0];
  const cardWidth = CONTENT_WIDTH - 32;
  const imageHeight = Math.round(cardWidth * 0.66);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
      <AccountIcon />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: cardWidth,
            backgroundColor: 'white',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          }}
        >
          {first.imageUrl && (
            <img
              src={first.imageUrl}
              alt=""
              style={{
                width: '100%',
                height: imageHeight,
                objectFit: 'cover',
                display: 'block',
              }}
              loading="lazy"
            />
          )}
          <div style={{ padding: '8px 10px' }}>
            {first.title && (
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#111',
                  lineHeight: 1.4,
                  margin: 0,
                  wordBreak: 'break-word',
                }}
              >
                {first.title}
              </p>
            )}
            {first.text && (
              <p
                style={{
                  fontSize: 12,
                  color: '#555',
                  lineHeight: 1.5,
                  margin: '4px 0 0',
                  wordBreak: 'break-word',
                }}
              >
                {first.text}
              </p>
            )}
          </div>
          {first.actions && first.actions.length > 0 && (
            <div style={{ borderTop: '1px solid #E5E5E5' }}>
              {first.actions.map((action, idx) => (
                <div
                  key={idx}
                  style={{
                    textAlign: 'center',
                    padding: '8px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: action.color || LINE_LINK_COLOR,
                    borderBottom:
                      idx < first.actions!.length - 1 ? '1px solid #E5E5E5' : 'none',
                  }}
                >
                  {action.label}
                </div>
              ))}
            </div>
          )}
        </div>
        {columns.length > 1 && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
            }}
          >
            +{columns.length - 1} 枚
          </div>
        )}
      </div>
    </div>
  );
});

// Flex message
const FlexMessage = memo(function FlexMessage({ message }: { message: LineMessage }) {
  // New-style: flexBlocks
  if (message.flexBlocks && message.flexBlocks.length > 0) {
    return <FlexBlocksMessage message={message} />;
  }

  // Legacy style
  const cardWidth = CONTENT_WIDTH * 0.88;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          width: cardWidth,
          backgroundColor: 'white',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {message.flexImageUrl && (
          <img
            src={message.flexImageUrl}
            alt=""
            style={{
              width: '100%',
              maxHeight: cardWidth * 0.6,
              objectFit: 'cover',
              display: 'block',
            }}
            loading="lazy"
          />
        )}
        <div style={{ padding: '10px 12px' }}>
          {message.flexTitle && (
            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#111',
                lineHeight: 1.35,
                margin: 0,
              }}
            >
              {message.flexTitle}
            </p>
          )}
          {message.flexBody && (
            <p
              style={{
                fontSize: 11,
                color: '#555',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                margin: '6px 0 0',
              }}
            >
              {message.flexBody}
            </p>
          )}
          {message.flexFooter && (
            <p style={{ fontSize: 10, color: '#999', margin: '6px 0 0' }}>
              {message.flexFooter}
            </p>
          )}
        </div>
        {message.flexButtons && message.flexButtons.length > 0 && (
          <div style={{ padding: '4px 10px 8px' }}>
            {message.flexButtons.map((btn, idx) => (
              <FlexButtonDisplay key={idx} button={btn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// Flex blocks (new style)
const FlexBlocksMessage = memo(function FlexBlocksMessage({
  message,
}: {
  message: LineMessage;
}) {
  const cardWidth = CONTENT_WIDTH;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
      <AccountIcon />
      <div
        style={{
          width: cardWidth - 32,
          backgroundColor: 'white',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {message.flexHeaderColor && (
          <div style={{ height: 5, backgroundColor: message.flexHeaderColor }} />
        )}
        {message.flexBlocks!.map((block) => (
          <BlockRenderer key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
});

// Block renderer for flex blocks
const BlockRenderer = memo(function BlockRenderer({ block }: { block: FlexBlock }) {
  const paddingMap: Record<string, string> = {
    normal: '7px 12px',
    wide: '12px 12px',
    'top-wide': '12px 12px 7px',
    'bottom-wide': '7px 12px 12px',
  };
  const basePadding = paddingMap[block.padding || 'normal'];

  switch (block.type) {
    case 'title':
      return (
        <div style={{ padding: basePadding, backgroundColor: block.backgroundColor || 'transparent' }}>
          {block.title && (
            <p style={{ fontSize: 14, fontWeight: 700, color: '#111', lineHeight: 1.4, margin: 0 }}>
              {block.title}
            </p>
          )}
          {block.subtitle && (
            <p style={{ fontSize: 10, color: '#888', lineHeight: 1.4, margin: '2px 0 0' }}>
              {block.subtitle}
            </p>
          )}
        </div>
      );

    case 'image':
      if (!block.imageUrl) return null;
      return (
        <div style={{ backgroundColor: block.backgroundColor || 'transparent' }}>
          <img
            src={block.imageUrl}
            alt=""
            style={{ width: '100%', display: 'block', objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      );

    case 'text':
      if (block.isBoxed) {
        return (
          <div style={{ padding: basePadding, backgroundColor: block.backgroundColor || 'transparent' }}>
            <div
              style={{
                backgroundColor: '#F5F5F5',
                borderLeft: '3px solid #DDD',
                padding: '6px 10px',
                borderRadius: '0 5px 5px 0',
                fontSize: 11,
                color: '#444',
                lineHeight: 1.6,
                wordBreak: 'break-word',
              }}
              dangerouslySetInnerHTML={{ __html: block.html || block.content || '' }}
            />
          </div>
        );
      }
      return (
        <div
          style={{
            padding: basePadding,
            backgroundColor: block.backgroundColor || 'transparent',
            fontSize: 11,
            color: '#333',
            lineHeight: 1.6,
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: block.html || block.content || '' }}
        />
      );

    case 'button': {
      const isFilled = block.buttonStyle === 'filled';
      const btnColor = block.buttonColor || LINE_GREEN;
      return (
        <div style={{ padding: '4px 12px 7px', backgroundColor: block.backgroundColor || 'transparent' }}>
          <div
            style={{
              textAlign: 'center',
              padding: '8px 6px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              color: isFilled ? 'white' : btnColor,
              backgroundColor: isFilled ? btnColor : 'white',
              border: isFilled ? 'none' : `1.5px solid ${btnColor}`,
            }}
          >
            {block.label}
          </div>
        </div>
      );
    }

    case 'video':
      return (
        <div
          style={{
            padding: basePadding,
            backgroundColor: block.backgroundColor || 'transparent',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              height: 100,
              backgroundColor: '#1a1a1a',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <polygon points="8,5 19,12 8,19" fill="rgba(255,255,255,0.7)" />
            </svg>
          </div>
        </div>
      );

    default:
      return null;
  }
});

// Flex button display (legacy)
const FlexButtonDisplay = memo(function FlexButtonDisplay({
  button,
}: {
  button: FlexButton;
}) {
  const isLink = button.type === 'uri';

  if (isLink) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '8px 0',
          fontSize: 12,
          fontWeight: 600,
          color: button.color || LINE_LINK_COLOR,
        }}
      >
        {button.label}
      </div>
    );
  }

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '8px 0',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 600,
        color: 'white',
        backgroundColor: button.color || LINE_GREEN,
        marginTop: 3,
      }}
    >
      {button.label}
    </div>
  );
});

// Rich menu indicator
const RichMenuIndicator = memo(function RichMenuIndicator({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0',
      }}
    >
      <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' }} />
      <span
        style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.7)',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
      <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' }} />
    </div>
  );
});
