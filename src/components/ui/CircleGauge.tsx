import React from 'react';

interface CircleGaugeProps {
  value: number; // 0-100の値
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'teal';
  showLabel?: boolean;
}

const sizeConfig = {
  sm: { width: 32, height: 32, strokeWidth: 3, fontSize: '10px' },
  md: { width: 48, height: 48, strokeWidth: 4, fontSize: '12px' },
  lg: { width: 64, height: 64, strokeWidth: 5, fontSize: '14px' }
};

const colorConfig = {
  blue: { stroke: '#3B82F6', fill: '#DBEAFE' },
  green: { stroke: '#10B981', fill: '#D1FAE5' },
  purple: { stroke: '#8B5CF6', fill: '#EDE9FE' },
  orange: { stroke: '#F59E0B', fill: '#FEF3C7' },
  teal: { stroke: '#14B8A6', fill: '#CCFBF1' }
};

export const CircleGauge: React.FC<CircleGaugeProps> = ({
  value,
  size = 'md',
  color = 'blue',
  showLabel = true
}) => {
  const config = sizeConfig[size];
  const colors = colorConfig[color];
  const radius = (config.width - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="inline-flex items-center justify-center">
      <div className="relative" style={{ width: config.width, height: config.height }}>
        <svg
          width={config.width}
          height={config.height}
          className="transform -rotate-90"
        >
          {/* 背景円 */}
          <circle
            cx={config.width / 2}
            cy={config.height / 2}
            r={radius}
            stroke={colors.fill}
            strokeWidth={config.strokeWidth}
            fill="none"
          />
          {/* 進捗円 */}
          <circle
            cx={config.width / 2}
            cy={config.height / 2}
            r={radius}
            stroke={colors.stroke}
            strokeWidth={config.strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300 ease-in-out"
          />
        </svg>
        {showLabel && (
          <div
            className="absolute inset-0 flex items-center justify-center font-medium text-gray-700 dark:text-gray-300"
            style={{ fontSize: config.fontSize }}
          >
            {Math.round(value)}%
          </div>
        )}
      </div>
    </div>
  );
};