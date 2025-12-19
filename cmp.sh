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
  COMPONENT_SUBDIR_CLEAN=$(echo "$COMPONENT_SUBDIR" | sed 's#/*$##') # Remove trailing slashes
  COMPONENT_SUBDIR="$COMPONENT_SUBDIR_CLEAN/" # Add one trailing slash
fi

# Convert names based *only* on the base name
KEBAB_NAME=$(to_kebab_case "$COMPONENT_BASE_NAME")
PASCAL_NAME=$(to_pascal_case "$COMPONENT_BASE_NAME")

# --- MODIFIED: Directory structure ---
# Define target directory: src/ + optional subdir + kebab-case base name (folder for .vue and .css)
COMPONENT_DIR="src/${COMPONENT_SUBDIR}${KEBAB_NAME}"
# Define base filename for CSS
CSS_BASE_FILENAME="$KEBAB_NAME.component.css"
# Define main Vue filename (PascalCase)
VUE_FILENAME="$PASCAL_NAME.vue"
# --- END MODIFIED ---

VUE_FILE_PATH="$COMPONENT_DIR/$VUE_FILENAME"
CSS_FILE_PATH="$COMPONENT_DIR/$CSS_BASE_FILENAME"

# Check if target base directory exists in the expected location
if [ ! -d "src" ]; then
    echo "Error: 'src' directory not found."
    echo "Please run this script from the root of your Vue project."
    exit 1
fi

# Check if component directory already exists
if [ -d "$COMPONENT_DIR" ]; then
  echo "Warning: Component directory '$COMPONENT_DIR' already exists."
  # Check if files already exist within the directory
  if [ -f "$VUE_FILE_PATH" ]; then
      echo "Error: Vue file '$VUE_FILE_PATH' already exists."
      exit 1
  fi
  if [ -f "$CSS_FILE_PATH" ]; then
      echo "Error: CSS file '$CSS_FILE_PATH' already exists."
      exit 1
  fi
else
  # Create directory if it doesn't exist
  echo "Creating component directory: $COMPONENT_DIR"
  mkdir -p "$COMPONENT_DIR"
  if [ $? -ne 0 ]; then
      echo "Error: Failed to create directory '$COMPONENT_DIR'."
      exit 1
  fi
fi


# --- Create Files ---

# Create main .vue file (Script + Template)
echo "Creating component file: $VUE_FILE_PATH"
cat <<EOF > "$VUE_FILE_PATH"
<script setup lang="ts">
import { ref, onMounted } from 'vue';

// Props definition (example)
// const props = defineProps<{
//   exampleProp: string;
// }>();

const componentName = ref('${PASCAL_NAME}');

// Methods (example)
// function someMethod() {
//   console.log('Method called');
// }

// Lifecycle hooks
onMounted(() => {
  console.log(\`\${componentName.value} component mounted.\`);
});
</script>

<template>
  <div class="${KEBAB_NAME}">
    {{ componentName }} works!
  </div>
</template>

<style scoped src="./${CSS_BASE_FILENAME}"></style>
EOF
if [ $? -ne 0 ]; then echo "Error creating $VUE_FILE_PATH"; exit 1; fi

# Create .css file (Styles)
echo "Creating style file: $CSS_FILE_PATH"
cat <<EOF > "$CSS_FILE_PATH"
.${KEBAB_NAME} {

}
EOF
if [ $? -ne 0 ]; then echo "Error creating $CSS_FILE_PATH"; exit 1; fi

# --- Completion Message ---
echo "----------------------------------------"
echo "Vue component '$PASCAL_NAME' created successfully in '$COMPONENT_DIR'"
echo "Files created:"
echo " - $VUE_FILE_PATH (Script + Template)"
echo " - $CSS_FILE_PATH (Styles)"
echo "----------------------------------------"
echo "Next steps:"
echo "1. Import '$VUE_FILENAME' into the parent component or Vue app."
# Construct relative import path for example
IMPORT_PATH="${COMPONENT_SUBDIR}${KEBAB_NAME}/${VUE_FILENAME}" # Path to the component folder/file
echo "   Example: import ${PASCAL_NAME} from '@/${IMPORT_PATH}';" # Assuming '@' maps to 'src/'
echo "2. Use the component in a template: <${PASCAL_NAME}></${PASCAL_NAME}>"
# --- END MODIFIED MESSAGES ---

exit 0