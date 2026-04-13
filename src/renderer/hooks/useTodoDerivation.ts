import { useEffect } from 'react';
import type { UIMessage } from 'ai';
import { deriveTodosFromMessages } from '../selectors/deriveTodos';
import { useTodoStore } from '../stores/todoStore';

export function useTodoDerivation(messages: UIMessage[]) {
  const setFromDerived = useTodoStore((s) => s.setFromDerived);

  useEffect(() => {
    setFromDerived(deriveTodosFromMessages(messages));
  }, [messages, setFromDerived]);
}
