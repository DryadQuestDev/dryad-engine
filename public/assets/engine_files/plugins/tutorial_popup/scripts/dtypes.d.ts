type TutorialService = {
  showHint(recordId: string): void;
  isShown(recordId: string): boolean;
  reset(): void;
};

interface Game {
  getService(id: 'tutorial'): TutorialService;
}
