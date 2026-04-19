const { game, vue } = window.engine;
const { defineComponent, computed } = vue;

console.log(`Game "${game.getId()}" is running`);

// Register a game state so the click count persists across saves
// and can be read/written from anywhere via game.getState/setState.
game.registerState('increment_demo_count', 0);

// Placeholder component demonstrating the `overlay-navigation-side` slot
const IncrementButton = defineComponent({
    setup() {
        const count = computed(() => game.getState('increment_demo_count'));
        const increment = () => {
            game.setState('increment_demo_count', count.value + 1);
        };
        return { count, increment };
    },
    template: /*html*/ `
        <div class="increment-demo">
            <button class="increment-demo__btn" @click="increment">
                Clicked {{ count }} time{{ count === 1 ? '' : 's' }}
            </button>
        </div>
    `
});

game.addComponent({
    id: 'increment_demo',
    slot: 'overlay-navigation-side',
    component: IncrementButton
});
