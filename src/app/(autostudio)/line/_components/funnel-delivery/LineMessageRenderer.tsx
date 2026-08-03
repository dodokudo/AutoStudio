'use client';

import { memo, useRef, useState, useEffect } from 'react';
import { LineMessage, CarouselColumn, FlexButton, FlexBlock } from './types';

// LINE実機準拠のカラー
const LINE_GREEN = '#06C755';
const LINE_BG = '#8AABCC'; // LINEトーク画面の背景色（実機準拠スカイブルー）
const LINE_BUBBLE_BG = '#FFFFFF'; // 公式アカウントの吹き出しは白
const LINE_LINK_COLOR = '#5B7FFF'; // LINEのリンクテキスト色

// LINEの実際のトーク画面幅（固定）
// この幅でレンダリングし、表示時にscaleで縮小する
const LINE_FIXED_WIDTH = 300;
const LINE_PADDING = 10;
const LINE_CONTENT_WIDTH = LINE_FIXED_WIDTH - LINE_PADDING * 2;

// LINE公式アカウントのデフォルトアイコン（SVGデータURI、緑丸+人物シルエット）
const DEFAULT_ACCOUNT_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#4A4A4A"/><circle cx="20" cy="16" r="7" fill="#FFF"/><ellipse cx="20" cy="34" rx="12" ry="10" fill="#FFF"/></svg>')}`;

interface LineMessageRendererProps {
  messages: LineMessage[];
  maxWidth: number; // グリッドセルの表示幅
  notificationText?: string; // プッシュ通知テキスト
}

export const LineMessageRenderer = memo(function LineMessageRenderer({
  messages,
  maxWidth,
  notificationText,
}: LineMessageRendererProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(undefined);

  // 表示領域に合わせて縮小・拡大する
  const scale = Math.min(1.7, maxWidth / LINE_FIXED_WIDTH);

  // 内側の実際の高さを測定して、scale後の高さを外側に反映
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const measure = () => {
      setScaledHeight(Math.ceil(el.offsetHeight * scale) + 2);
    };

    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    measure();

    const images = el.querySelectorAll('img');
    const handleLoad = () => measure();
    images.forEach(img => img.addEventListener('load', handleLoad));

    return () => {
      observer.disconnect();
      images.forEach(img => img.removeEventListener('load', handleLoad));
    };
  }, [scale, messages]);

  if (!messages || messages.length === 0) return null;

  return (
    <div
      style={{
        width: maxWidth,
        height: scaledHeight,
        position: 'relative',
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: LINE_FIXED_WIDTH,
          backgroundColor: LINE_BG,
          borderRadius: 8,
          padding: `${LINE_PADDING}px`,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.map((msg) => (
            <LineMessageItem key={msg.id} message={msg} />
          ))}
        </div>
        {notificationText && (
          <div style={{
            marginTop: 8,
            padding: '5px 8px',
            backgroundColor: 'rgba(0,0,0,0.15)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4,
          }}>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.6)',
              whiteSpace: 'nowrap',
              lineHeight: 1.5,
            }}>
              通知:
            </span>
            <span style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.85)',
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}>
              {notificationText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
// 画像プレースホルダー（imageUrlがない場合に表示）
const ImagePlaceholder = memo(function ImagePlaceholder({
  width,
  height,
  label,
}: {
  width: string | number;
  height: number;
  label?: string;
}) {
  return (
    <div
      style={{
        width,
        height,
        background: 'linear-gradient(135deg, #E8EDF2 0%, #D1D9E0 50%, #C4CDD6 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#666" strokeWidth="1.5"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="#666"/>
        <path d="M21 15l-5-5L5 21" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label && (
        <span style={{ fontSize: 9, color: '#888', fontWeight: 500 }}>{label}</span>
      )}
    </div>
  );
});

// メッセージタイプラベル（カード系のみ表示）
const TYPE_LABELS: Partial<Record<LineMessage['type'], { label: string; color: string }>> = {
  carousel: { label: 'カルーセル', color: '#3B82F6' },
  flex: { label: 'フレックス', color: '#8B5CF6' },
  audio: { label: '音声', color: '#F59E0B' },
  video: { label: '動画', color: '#EF4444' },
};

// アカウントアイコン（吹き出し左上に表示）
const AccountIcon = memo(function AccountIcon() {
  return (
    <img
      src={DEFAULT_ACCOUNT_ICON}
      alt=""
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        flexShrink: 0,
      }}
      draggable={false}
    />
  );
});

// メッセージ振り分け
const LineMessageItem = memo(function LineMessageItem({
  message,
}: {
  message: LineMessage;
}) {
  const labelInfo = TYPE_LABELS[message.type];

  const content = (() => {
    switch (message.type) {
      case 'text':
        return <LineTextBubble text={message.text || (message as any).content || ''} />;
      case 'image':
        return <LineImageMessage imageUrl={message.imageUrl || ''} />;
      case 'carousel':
        return <LineCarouselMessage columns={message.columns || []} />;
      case 'flex':
        return <LineFlexMessage message={message} />;
      case 'audio':
        return <LineAudioMessage text={message.text || '【音声メッセージ】'} />;
      case 'video':
        return <LineVideoMessage text={message.text || '【動画メッセージ】'} />;
      case 'richmenu':
        return <LineRichMenuIndicator text={message.text || 'リッチメニュー切替'} />;
      default:
        return null;
    }
  })();

  if (!labelInfo) return content;

  return (
    <div>
      <span style={{
        display: 'inline-block',
        fontSize: 9,
        fontWeight: 700,
        color: 'white',
        backgroundColor: labelInfo.color,
        borderRadius: 4,
        padding: '1px 5px',
        marginBottom: 3,
        letterSpacing: '0.02em',
      }}>
        {labelInfo.label}
      </span>
      {content}
    </div>
  );
});

// テキスト吹き出し（公式アカウントからの受信メッセージ = 白背景 + アイコン）
const LineTextBubble = memo(function LineTextBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <AccountIcon />
      <div
        style={{
          backgroundColor: LINE_BUBBLE_BG,
          color: '#111',
          maxWidth: `calc(100% - 34px)`,
          fontSize: 13,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          padding: '8px 12px',
          borderRadius: '16px 16px 16px 4px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
      >
        {text}
      </div>
    </div>
  );
});

// 画像メッセージ
const LineImageMessage = memo(function LineImageMessage({
  imageUrl,
}: {
  imageUrl: string;
}) {
  if (!imageUrl) return null;

  return (
    <div style={{ display: 'flex', width: '100%' }}>
      <img
        src={imageUrl}
        alt=""
        style={{
          width: '100%',
          maxWidth: LINE_CONTENT_WIDTH,
          maxHeight: 300,
          borderRadius: 12,
          objectFit: 'cover',
          display: 'block',
        }}
        loading="lazy"
        draggable={false}
      />
    </div>
  );
});

// 音声メッセージ
const LineAudioMessage = memo(function LineAudioMessage({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <AccountIcon />
      <div
        style={{
          backgroundColor: LINE_BUBBLE_BG,
          maxWidth: `calc(100% - 34px)`,
          padding: '10px 14px',
          borderRadius: '16px 16px 16px 4px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: '#F59E0B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>{text}</div>
          <div style={{
            marginTop: 3,
            width: 80,
            height: 4,
            backgroundColor: '#FDE68A',
            borderRadius: 2,
          }}/>
        </div>
      </div>
    </div>
  );
});

// 動画メッセージ
const LineVideoMessage = memo(function LineVideoMessage({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <AccountIcon />
      <div
        style={{
          backgroundColor: '#1F2937',
          maxWidth: `calc(100% - 34px)`,
          width: 200,
          height: 120,
          borderRadius: '16px 16px 16px 4px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          position: 'relative' as const,
        }}
      >
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{text}</div>
      </div>
    </div>
  );
});

// カルーセルメッセージ（LINE実機準拠）
// 実機スクショ参照: IMG_6352-6354, IMG_6359-6361
// - 1枚: フル幅カード（アイコン+カード）
// - 複数枚: 1枚目が幅の約80%、2枚目以降がチラ見え横スクロール
const LineCarouselMessage = memo(function LineCarouselMessage({
  columns,
}: {
  columns: CarouselColumn[];
}) {
  if (!columns || columns.length === 0) return null;
  const isSingle = columns.length === 1;
  // 実機準拠: 複数枚は1枚目がトーク幅の約75-80%を占める
  const cardWidth = isSingle ? LINE_CONTENT_WIDTH - 34 : 220;
  // 実機準拠: 画像は横長バナー比率（約1024:678 ≈ 3:2）
  const imageHeight = isSingle ? Math.round(cardWidth * 0.66) : Math.round(220 * 0.66);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <AccountIcon />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowX: isSingle ? 'visible' : 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            paddingBottom: 4,
            // 複数枚時はカードがはみ出して横スクロール
            width: isSingle ? '100%' : 'max-content',
          }}
        >
          {columns.map((col) => (
            <div
              key={col.id}
              style={{
                flexShrink: 0,
                width: cardWidth,
                backgroundColor: 'white',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }}
            >
              {col.imageUrl && (
                <img
                  src={col.imageUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: imageHeight,
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  loading="lazy"
                  draggable={false}
                />
              )}
              <div style={{ padding: '10px 12px' }}>
                {col.title && (
                  <p style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#111',
                    lineHeight: 1.4,
                    margin: 0,
                    wordBreak: 'break-word',
                  }}>
                    {col.title}
                  </p>
                )}
                {col.text && (
                  <p style={{
                    fontSize: 13,
                    color: '#555',
                    lineHeight: 1.5,
                    margin: '6px 0 0',
                    wordBreak: 'break-word',
                  }}>
                    {col.text}
                  </p>
                )}
              </div>
              {col.actions && col.actions.length > 0 && (
                <div style={{ borderTop: '1px solid #E5E5E5' }}>
                  {col.actions.map((action, idx) => (
                    <div
                      key={idx}
                      style={{
                        textAlign: 'center',
                        padding: '10px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: action.color || LINE_LINK_COLOR,
                        borderBottom: idx < col.actions!.length - 1 ? '1px solid #E5E5E5' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {action.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// フレックスメッセージ（LINE実機準拠）
const LineFlexMessage = memo(function LineFlexMessage({
  message,
}: {
  message: LineMessage;
}) {
  if (message.flexBlocks && message.flexBlocks.length > 0) {
    return <LineFlexBlocksMessage message={message} />;
  }

  const cardWidth = LINE_CONTENT_WIDTH;

  return (
    <div style={{ display: 'flex', width: '100%' }}>
      <div
        style={{
          width: cardWidth,
          backgroundColor: 'white',
          borderRadius: 12,
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
            draggable={false}
          />
        )}
        <div style={{ padding: '12px 14px' }}>
          {message.flexTitle && (
            <p style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#111',
              lineHeight: 1.35,
              margin: 0,
            }}>
              {message.flexTitle}
            </p>
          )}
          {message.flexBody && (
            <p style={{
              fontSize: 12,
              color: '#555',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              margin: '8px 0 0',
            }}>
              {message.flexBody}
            </p>
          )}
        </div>
        {message.flexButtons && message.flexButtons.length > 0 && (
          <div style={{ padding: '4px 12px 10px' }}>
            {message.flexButtons.map((btn, idx) => (
              <FlexButtonDisplay key={idx} button={btn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// フレックスメッセージ — 新方式（ブロック配列）
const LineFlexBlocksMessage = memo(function LineFlexBlocksMessage({
  message,
}: {
  message: LineMessage;
}) {
  return (
    <div style={{ display: 'flex', width: '100%' }}>
      <div
        style={{
          width: LINE_CONTENT_WIDTH,
          backgroundColor: 'white',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {message.flexHeaderColor && (
          <div style={{
            height: 6,
            backgroundColor: message.flexHeaderColor,
          }} />
        )}
        {message.flexBlocks!.map((block) => (
          <FlexBlockRenderer key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
});

// 個別ブロックレンダリング
const FlexBlockRenderer = memo(function FlexBlockRenderer({
  block,
}: {
  block: FlexBlock;
}) {
  const paddingMap: Record<string, string> = {
    normal: '8px 14px',
    wide: '14px 14px',
    'top-wide': '14px 14px 8px',
    'bottom-wide': '8px 14px 14px',
  };
  const basePadding = paddingMap[block.padding || 'normal'];

  switch (block.type) {
    case 'title':
      return (
        <div style={{
          padding: basePadding,
          backgroundColor: block.backgroundColor || 'transparent',
        }}>
          {block.title && (
            <p style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#111',
              lineHeight: 1.4,
              margin: 0,
            }}>
              {block.title}
            </p>
          )}
          {block.subtitle && (
            <p style={{
              fontSize: 11,
              color: '#888',
              lineHeight: 1.4,
              margin: '2px 0 0',
            }}>
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
            style={{
              width: '100%',
              display: 'block',
              objectFit: 'cover',
            }}
            loading="lazy"
            draggable={false}
          />
        </div>
      );

    case 'text':
      if (block.isBoxed) {
        return (
          <div style={{
            padding: basePadding,
            backgroundColor: block.backgroundColor || 'transparent',
          }}>
            <div style={{
              backgroundColor: '#F5F5F5',
              borderLeft: '3px solid #DDD',
              padding: '8px 12px',
              borderRadius: '0 6px 6px 0',
              fontSize: 12,
              color: '#444',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
              dangerouslySetInnerHTML={{ __html: block.html || '' }}
            />
          </div>
        );
      }
      return (
        <div style={{
          padding: basePadding,
          backgroundColor: block.backgroundColor || 'transparent',
          fontSize: 12,
          color: '#333',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
          dangerouslySetInnerHTML={{ __html: block.html || '' }}
        />
      );

    case 'button': {
      const isFilled = block.buttonStyle === 'filled';
      const btnColor = block.buttonColor || LINE_GREEN;
      return (
        <div style={{
          padding: '4px 14px 8px',
          backgroundColor: block.backgroundColor || 'transparent',
        }}>
          <div
            style={{
              textAlign: 'center',
              padding: '10px 8px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: isFilled ? 'white' : btnColor,
              backgroundColor: isFilled ? btnColor : 'white',
              border: block.buttonStyle === 'outlined' ? `1.5px solid ${btnColor}` : 'none',
              cursor: 'pointer',
            }}
          >
            {block.label}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
});

// フレックスボタン表示（LINE実機準拠 -- 角丸ボタン）旧方式用
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
          padding: '9px 0',
          fontSize: 13,
          fontWeight: 600,
          color: button.color || LINE_LINK_COLOR,
          cursor: 'pointer',
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
        padding: '10px 0',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: 'white',
        backgroundColor: button.color || LINE_GREEN,
        marginTop: 4,
        cursor: 'pointer',
      }}
    >
      {button.label}
    </div>
  );
});

// リッチメニュー切替表示
const LineRichMenuIndicator = memo(function LineRichMenuIndicator({
  text,
}: {
  text: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 0',
    }}>
      <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' }} />
      <span style={{
        fontSize: 10,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        {text}
      </span>
      <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' }} />
    </div>
  );
});
