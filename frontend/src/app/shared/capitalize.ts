import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/** "juan dela cruz" → "Juan Dela Cruz": capital first letter of every word (also after "-" or "'"); other letters stay as typed. */
export function capitalizeWords(value: string): string {
  return value.replace(/(^|[\s\-'])(\p{Ll})/gu, (_m, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * Put on a name field (<input> or <ion-input>): each word starts with a capital letter while typing.
 * It fixes the text before ngModel reads it, and keeps the cursor where it was.
 */
@Directive({
  selector: '[appCapitalize]',
  host: { autocapitalize: 'words' },
})
export class CapitalizeDirective implements OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  // capture phase: runs before ngModel / ion-input see the typed text
  private onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement | null;
    if (!input || typeof input.value !== 'string') return;
    const fixed = capitalizeWords(input.value);
    if (fixed === input.value) return;
    const { selectionStart, selectionEnd } = input;
    input.value = fixed; // same length, so the cursor position stays valid
    if (selectionStart !== null && selectionEnd !== null) input.setSelectionRange(selectionStart, selectionEnd);
  };

  constructor() {
    this.host.addEventListener('input', this.onInput, true);
  }

  ngOnDestroy(): void {
    this.host.removeEventListener('input', this.onInput, true);
  }
}
