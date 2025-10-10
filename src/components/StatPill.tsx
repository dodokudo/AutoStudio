import React from 'react';

interface StatPillProps {
  icon: string;
  value: string | number;
  color: 'green' | 'blue' | 'purple' | 'orange' | 'teal' | 'red';
  size?: 'sm' | 'md';
}

const colorClasses = {
  green: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700',
  blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700',
  orange: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  teal: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700',
  red: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
};

const sizeClasses = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-2.5 py-1 text-xs'
};

export const StatPill: React.FC<StatPillProps> = ({
  icon,
  value,
  color,
  size = 'md'
}) => {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium border ${colorClasses[color]} ${sizeClasses[size]}`}>
      <span>{icon}</span>
      <span>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </span>
  );
};