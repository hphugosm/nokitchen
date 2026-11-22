import { useEffect, useRef, useState } from 'react'
import type { Scenario } from '../application/state'
import { reportStage } from './client'

// Browser receipts are authoritative for inventory. The staging DB needs only their processing stage.
export function useProcessingStatus(scenario: Scenario, suspended: boolean) {
  const acknowledged = useRef(new Map<string, 'reviewed' | 'received'>())
  const [warning, setWarning] = useState<string | null>(null)
  useEffect(() => {
    if (!__OPERATOR_MODE__ || suspended) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function reconcile() {
      try {
        for (const offer of scenario.proposals) {
          const msg = offer.document?.message
          const stage = scenario.offerStatus[offer.id]
          if (!active) return
          if (
            msg?.kind !== 'agentboxd' ||
            !msg.stagingId ||
            (stage !== 'reviewed' && stage !== 'received')
          )
            continue
          const sent = acknowledged.current.get(msg.stagingId)
          if (sent === stage || sent === 'received') continue
          // A crash can occur between recording a review locally and acknowledging it.
          if (stage === 'received' && sent !== 'reviewed')
            await reportStage(msg.stagingId, 'reviewed')
          if (!active) return
          await reportStage(msg.stagingId, stage)
          if (active) acknowledged.current.set(msg.stagingId, stage)
        }
        if (active) setWarning(null)
      } catch {
        if (!active) return
        setWarning(
          'Changes are saved in this browser. The inbox processing status will retry when the local operator service is available.',
        )
        timer = setTimeout(reconcile, 20000)
      }
    }
    void reconcile()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [scenario.proposals, scenario.offerStatus, suspended])
  return warning
}
