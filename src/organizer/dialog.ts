import { useRef } from 'react'
import type { MouseEvent, RefObject } from 'react'

export const useBackdropClose = (dialog: RefObject<HTMLDialogElement | null>, isBusy = false) => {
  const mouseDownOnDialog = useRef(false)

  const onMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    mouseDownOnDialog.current = event.target === event.currentTarget
  }

  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && mouseDownOnDialog.current && !isBusy) dialog.current?.close()
    mouseDownOnDialog.current = false
  }

  return { onMouseDown, onClick }
}
