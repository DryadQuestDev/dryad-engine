#!/bin/bash

# Function to convert camelCase or PascalCase to kebab-case
# Example: MyComponentName -> my-component-name
to_kebab_case() {
  echo "$1" | sed -E 's/([A-Z])/-\1/g' | sed -E 's/^-//' | tr '[:upper:]' '[:lower:]'
}

# Function to convert kebab-case or snake_case to PascalCase
# Example: my-component-name -> MyComponentName
to_pascal_case() {
  # Ensure input starts lowercase for sed pattern, then capitalize first letter
  local temp_name=$(echo "$1" | sed -E 's/^(.)/\L\1/')
  echo "$temp_name" | sed -E 's/(-|_)([a-zA-Z])/\U\2/g' | sed -E 's/^(.)/\U\1/'
}

# --- Script Start ---

# Check if component name/path is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <[path/]ComponentName>"
  echo "  <ComponentName> can be PascalCase (MyComponent) or kebab-case (my-component)."
  echo "  Optionally include a path relative to 'src/' (e.g., 'shared/MyButton')."
  echo "Example: $0 MyAwesomeComponent"
  echo "Example: $0 common/buttons/SubmitButton"
  exit 1
fi

COMPONENT_PATH_INPUT="$1"

# Extract the directory path part (if any)
COMPONENT_SUBDIR=$(dirname "$COMPONENT_PATH_INPUT")
# Extract the base name part
COMPONENT_BASE_NAME=$(basename "$COMPONENT_PATH_INPUT")

# If no directory path was provided, dirname returns '.', adjust it to empty
if [ "$COMPONENT_SUBDIR" == "." ]; then
  COMPONENT_SUBDIR=""
else
  # Ensure the subdir doesn't end with a slash for directory creation,
  # but add one later when constructing the final component dir path.
  COMPONENT_SUBDIR_CLEAN=$(echo "$COMPONENT_SUBDIR" | sed 's#/*$##') # Remove trailing slashes
  COMPONENT_SUBDIR="$COMPONENT_SUBDIR_CLEAN/" # Add one trailing slash
fi

# Convert names based *only* on the base name
KEBAB_NAME=$(to_kebab_case "$COMPONENT_BASE_NAME")
PASCAL_NAME=$(to_pascal_case "$COMPONENT_BASE_NAME")

# --- MODIFIED BLOCK: Target directory is now just the subdirectory path ---
# Define target directory: src/ + optional subdir
# The component file itself will be placed directly in this directory.
if [ -z "$COMPONENT_SUBDIR" ]; then
    COMPONENT_DIR="src"
else
    COMPONENT_DIR="src/${COMPONENT_SUBDIR%/}" # Remove trailing slash for mkdir
fi

# --- MODIFIED LINE: Component file path ---
VUE_FILE="src/${COMPONENT_SUBDIR}${PASCAL_NAME}.vue" # Use PascalCase for .vue file name

# Check if target base directory exists in the expected location
if [ ! -d "src" ]; then
    echo "Error: 'src' directory not found."
    echo "Please run this script from the root of your Vue project."
    exit 1
fi

# Check if component file already exists
if [ -f "$VUE_FILE" ]; then
  echo "Error: Component file '$VUE_FILE' already exists."
  exit 1
fi

# Create directory if it doesn't exist (use -p for nested paths)
# Only create if COMPONENT_DIR is not just 'src'
if [ "$COMPONENT_DIR" != "src" ]; then
    echo "Ensuring component directory exists: $COMPONENT_DIR"
    mkdir -p "$COMPONENT_DIR"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create directory '$COMPONENT_DIR'."
        exit 1
    fi
fi

# --- Create Single .vue File ---
echo "Creating component file: $VUE_FILE"
cat <<EOF > "$VUE_FILE"
<script setup lang="ts">
import { Game } from '../game/game';

const game = Game.getInstance();

const COMPONENT_ID = '${KEBAB_NAME}';

// Props definition (example)
// const props = defineProps<{
//   exampleProp: string;
// }>();

// Methods (example)
// function someMethod() {
//   console.log('Method called');
// }
</script>

<template>
  <div :id="COMPONENT_ID" class="${KEBAB_NAME}">
    <!-- ${PASCAL_NAME} content -->
    ${PASCAL_NAME} works!
    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.${KEBAB_NAME} {
  /* Add your component-specific styles here */
}
</style>
EOF
if [ $? -ne 0 ]; then echo "Error creating $VUE_FILE"; exit 1; fi


# --- Completion Message ---
echo "----------------------------------------"
echo "Vue component '$PASCAL_NAME' created successfully as '$VUE_FILE'"
echo "----------------------------------------"
echo "Component ID: ${KEBAB_NAME}"
echo ""
echo "This component supports custom component registration."
echo "Modders can inject custom components into it:"
echo "   game.registerCustomComponent(TheirComponent, '${KEBAB_NAME}');"
echo ""
echo "Next steps:"
echo "1. Import '$PASCAL_NAME.vue' into the parent component or Vue app."
IMPORT_PATH="${COMPONENT_SUBDIR}${PASCAL_NAME}.vue"
echo "   Example: import ${PASCAL_NAME} from '@/${IMPORT_PATH}';"
echo "2. Use the component in a template: <${PASCAL_NAME}></${PASCAL_NAME}>"

exit 0
