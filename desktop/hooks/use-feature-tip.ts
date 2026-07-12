'use client'

import { useState, useEffect, useCallback } from 'react'
import { hasSeenTip, markTipSeen } from '@/desktop/lib/feature-tips'

export function useFeatureTip(tipId: string) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // On mount, show if not yet seen
    if (!hasSeenTip(tipId)) {
      // Short delay so page renders first
      const timer = setTimeout(() => setVisible(true), 500)
      return () => clearTimeout(timer)
    }
  }, [tipId])

  const dismiss = useCallback(() => {
    setVisible(false)
    markTipSeen(tipId)
  }, [tipId])

  return { visible, dismiss }
}
