"""
HAL 2.0 - HTTPS startup (legacy wrapper)
Use: python start.py --https
"""
import sys
sys.argv.append("--https")

from start import main
main()
