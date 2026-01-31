"""
Script to update agent_system.py to use HAL persona as default
Run from backend directory: python update_default_persona.py
"""

import re

# Read the file
with open('app/services/agent_system.py', 'r', encoding='utf-8') as f:
    content = f.read()

# The old code pattern
old_code = '''    async def _get_system_prompt(self, persona_id: Optional[str], user_id: str, enabled_tools: Optional[List[str]] = None, voice_mode: bool = False, user_message: str = "") -> str:
        """Get system prompt from persona or default, with optional memory injection for voice mode"""
        
        # For voice mode, automatically fetch relevant memories to inject
        memory_context = ""
        if voice_mode and user_message:
            memory_context = await self._get_relevant_memories_for_context(user_id, user_message)
        
        if persona_id:
            persona = await database.personas.find_one({"_id": ObjectId(persona_id)})
            if persona:
                base_prompt = persona["system_prompt"]
                # Add tool availability info to persona prompt
                prompt = self._add_tool_availability_info(base_prompt, enabled_tools)
                if memory_context:
                    prompt = self._inject_memory_context(prompt, memory_context)
                # Add anti-hallucination rules to ALL prompts (including personas)
                prompt = self._add_anti_hallucination_rules(prompt)
                return prompt
        
        # Build the default system prompt with tool availability'''

# The new code
new_code = '''    async def _get_system_prompt(self, persona_id: Optional[str], user_id: str, enabled_tools: Optional[List[str]] = None, voice_mode: bool = False, user_message: str = "") -> str:
        """Get system prompt from persona or default, with optional memory injection for voice mode"""
        
        # For voice mode, automatically fetch relevant memories to inject
        memory_context = ""
        if voice_mode and user_message:
            memory_context = await self._get_relevant_memories_for_context(user_id, user_message)
        
        persona = None
        if persona_id:
            persona = await database.personas.find_one({"_id": ObjectId(persona_id)})
        
        # If no persona specified, use the default system persona (HAL)
        if not persona:
            persona = await database.personas.find_one({"is_system": True, "is_default": True})
            # Fallback to HAL persona by name if is_default not set
            if not persona:
                persona = await database.personas.find_one({"is_system": True, "name": "HAL"})
        
        if persona:
            base_prompt = persona["system_prompt"]
            # Add tool availability info to persona prompt
            prompt = self._add_tool_availability_info(base_prompt, enabled_tools)
            if memory_context:
                prompt = self._inject_memory_context(prompt, memory_context)
            # Add anti-hallucination rules to ALL prompts (including personas)
            prompt = self._add_anti_hallucination_rules(prompt)
            return prompt
        
        # Build the default system prompt with tool availability (fallback if no HAL persona exists)'''

# Replace
if old_code in content:
    content = content.replace(old_code, new_code)
    
    # Write back
    with open('app/services/agent_system.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("[OK] Successfully updated agent_system.py")
    print("   - Now uses HAL persona as default when no persona selected")
    print("   - Falls back to hardcoded prompt only if HAL persona doesn't exist")
else:
    print("[SKIP] Could not find the target code block to replace")
    print("   The file may have already been modified or the code structure changed")
