'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both'
}

export function ScrollArea({
  children,
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaProps) {
  return (
    <div className={cn('relative overflow-hidden', className)} {...props}>
      <div
        className={cn(
          'h-full w-full scrollbar-thin',
          orientation === 'vertical' && 'overflow-x-hidden overflow-y-auto',
          orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
          orientation === 'both' && 'overflow-auto'
        )}
      >
        {children}
      </div>
    </div>
  )
}
